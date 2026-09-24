import Foundation
import Observation
import SwiftData

/// Keeps this device's kitchen and one kitchen on a self-hosted Sous Chef
/// server in step. The device's SwiftData store (synced through iCloud) stays
/// the working copy, so the app works offline; each sync pushes local changes
/// and then mirrors the server.
///
/// Conflicts resolve as "latest pusher wins": a device's unsynced edit is sent
/// before the server copy is read back.
@Observable
final class CompanionServer {
    enum Status: Equatable {
        case idle, syncing, synced(Date), failed(String)
    }

    private(set) var address = UserDefaults.standard.string(forKey: "server.url") ?? ""
    private(set) var email = UserDefaults.standard.string(forKey: "server.email") ?? ""
    private(set) var householdID = UserDefaults.standard.string(forKey: "server.household")
    private(set) var householdName = UserDefaults.standard.string(forKey: "server.householdName")
    private(set) var households: [DTO.Household] = []
    private(set) var status: Status = .idle
    private(set) var client: ServerClient?
    var autoSync = UserDefaults.standard.object(forKey: "server.autoSync") as? Bool ?? true {
        didSet { UserDefaults.standard.set(autoSync, forKey: "server.autoSync") }
    }

    private var initialSyncDone: Bool {
        get { UserDefaults.standard.bool(forKey: "server.initialSyncDone") }
        set { UserDefaults.standard.set(newValue, forKey: "server.initialSyncDone") }
    }
    private var pendingSync: Task<Void, Never>?
    private var running = false
    private var rerun = false
    weak var kitchen: Kitchen?

    init() {
        // Keychain items outlive an uninstall; don't resurrect an old session.
        if !UserDefaults.standard.bool(forKey: "server.installed") {
            Keychain.delete(account: "session")
            UserDefaults.standard.set(true, forKey: "server.installed")
        }
        if let url = try? ServerClient.normalize(address), !address.isEmpty, let token = Keychain.read(account: "session") {
            client = ServerClient(baseURL: url, token: token)
        }
    }

    var isConnected: Bool { client?.token != nil }

    var lastSynced: Date? {
        if case .synced(let date) = status { return date }
        return UserDefaults.standard.object(forKey: "server.lastSynced") as? Date
    }

    // MARK: Connection

    func connect(address: String, email: String, password: String, createAccount: Bool, name: String?) async throws {
        let url = try ServerClient.normalize(address)
        let candidate = ServerClient(baseURL: url, token: nil)
        _ = try await candidate.status()
        try await candidate.authenticate(flow: createAccount ? "signUp" : "signIn", email: email.trimmingCharacters(in: .whitespaces).lowercased(), password: password, name: name)
        let households = try await candidate.call("households:list", as: [DTO.Household].self)
        guard let current = households.first(where: \.isCurrent) ?? households.first else {
            throw ServerClient.ServerError.server("Your account doesn't have a kitchen yet. Open Sous Chef on the web once to create one.")
        }
        Keychain.save(candidate.token ?? "", account: "session")
        self.address = url.absoluteString
        self.email = email
        UserDefaults.standard.set(self.address, forKey: "server.url")
        UserDefaults.standard.set(email, forKey: "server.email")
        self.households = households
        setHousehold(current)
        initialSyncDone = false
        client = candidate
        await syncNow()
    }

    private func setHousehold(_ household: DTO.Household) {
        householdID = household.id
        householdName = household.name
        UserDefaults.standard.set(household.id, forKey: "server.household")
        UserDefaults.standard.set(household.name, forKey: "server.householdName")
    }

    func refreshHouseholds() async {
        guard let client else { return }
        if let list = try? await client.call("households:list", as: [DTO.Household].self) { households = list }
    }

    /// Mirrors a different server kitchen on this device. Unsynced changes go
    /// to the current kitchen first.
    func switchHousehold(_ household: DTO.Household) async {
        guard household.id != householdID, let kitchen else { return }
        await syncNow()
        kitchen.removeAllServerLinkedData()
        setHousehold(household)
        initialSyncDone = true
        await syncNow()
    }

    /// Stops syncing. This device keeps its kitchen as local-only data.
    func disconnect() async {
        pendingSync?.cancel()
        await client?.signOut()
        client = nil
        Keychain.delete(account: "session")
        kitchen?.unlinkFromServer()
        householdID = nil
        householdName = nil
        households = []
        status = .idle
        for key in ["server.household", "server.householdName", "server.lastSynced", "server.initialSyncDone"] {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    // MARK: Sync

    /// Debounced sync after local edits.
    func scheduleSync() {
        guard isConnected, autoSync else { return }
        pendingSync?.cancel()
        pendingSync = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1.5))
            guard !Task.isCancelled else { return }
            await self?.syncNow()
        }
    }

    func syncNow() async {
        guard let client, let kitchen, client.token != nil else { return }
        if running { rerun = true; return }
        running = true
        defer { running = false }
        status = .syncing
        repeat {
            rerun = false
            do {
                try await SyncPass(client: client, kitchen: kitchen, householdID: householdID, linkExisting: !initialSyncDone).run()
                initialSyncDone = true
                let now = Date()
                UserDefaults.standard.set(now, forKey: "server.lastSynced")
                status = .synced(now)
            } catch ServerClient.ServerError.notAuthenticated {
                status = .failed("Your server session ended. Sign in again in Settings.")
                self.client = nil
                Keychain.delete(account: "session")
                return
            } catch {
                status = .failed(error.localizedDescription)
                return
            }
        } while rerun
    }

    /// Server-side cooking keeps inventory deduction atomic across devices.
    func cookOnServer(_ recipe: Recipe, addMissing: Bool) async throws -> Bool {
        guard let client, let kitchen else { return false }
        try await SyncPass(client: client, kitchen: kitchen, householdID: householdID, linkExisting: false).push()
        guard let serverID = recipe.serverID else { return false }
        _ = try await client.call("cooking:cookRecipe", ["recipeId": serverID, "addMissingToShoppingList": addMissing, "acknowledgeManualChecks": true])
        await syncNow()
        return true
    }

    /// Uses the AI provider configured on the person's own server.
    func generateRecipe(preferences: String) async throws -> RecipeDraft {
        guard let client else { throw ServerClient.ServerError.notAuthenticated }
        let result = try await client.call("recipeIdeas:generate", ["preferences": String(preferences.prefix(1000))], as: DTO.AIDraft.self)
        var draft = RecipeDraft()
        draft.title = result.draft.title
        draft.summary = result.draft.description
        draft.servings = Int(result.draft.servings)
        draft.totalTimeMinutes = Int(result.draft.totalTimeMinutes)
        draft.ingredients = result.draft.ingredients.map { Ingredient(name: $0.name, quantity: $0.quantity, unit: $0.unit) }
        draft.steps = result.draft.steps.map { RecipeStep(text: $0.text) }
        draft.notes = "Drafted by \(result.provider) (\(result.model)) on your Sous Chef server. Check it before cooking."
        return draft
    }
}

/// One push-then-pull round trip.
private struct SyncPass {
    let client: ServerClient
    let kitchen: Kitchen
    let householdID: String?
    let linkExisting: Bool

    private var context: ModelContext { kitchen.context }
    private var scope: [String: Any] { householdID.map { ["householdId": $0] } ?? [:] }

    func run() async throws {
        if linkExisting { try await link() }
        try await push()
        try await pull()
        try context.save()
    }

    private func all<T: PersistentModel>(_ type: T.Type) -> [T] {
        (try? context.fetch(FetchDescriptor<T>())) ?? []
    }

    private func notFound(_ error: Error) -> Bool {
        if case ServerClient.ServerError.server(let message) = error { return message.localizedCaseInsensitiveContains("not found") }
        return false
    }

    // MARK: First connection

    /// Pairs records that already exist on both sides so connecting an
    /// existing kitchen doesn't duplicate everything. Paired records take the
    /// server's copy; the server is the kitchen the person already runs.
    private func link() async throws {
        let inventory = try await client.call("inventory:list", scope, as: DTO.InventoryList.self).items
        var unclaimed = inventory
        for item in all(PantryItem.self) where item.serverID == nil {
            if let index = unclaimed.firstIndex(where: { normalizeName($0.name) == normalizeName(item.name) && StorageLocation(rawValue: $0.locationId) == item.location && normalizeName($0.unit) == normalizeName(item.unit) }) {
                item.serverID = unclaimed.remove(at: index).id
                item.needsPush = false
            }
        }
        var recipes = try await client.call("recipes:list", scope, as: DTO.RecipeList.self).recipes
        for recipe in all(Recipe.self) where recipe.serverID == nil {
            if let index = recipes.firstIndex(where: { normalizeName($0.title) == normalizeName(recipe.title) }) {
                let server = recipes.remove(at: index)
                recipe.serverID = server.id
                recipe.syncedFavorited = server.favorited
                // A server photo downloads on pull; a photo only on this
                // device is uploaded instead.
                recipe.remotePhotoPath = nil
                recipe.needsPush = server.photoUrl == nil && recipe.photo != nil
                recipe.photoNeedsUpload = recipe.needsPush
                recipe.favorited = server.favorited
            }
        }
        var shopping = try await client.call("shoppingList:get", scope, as: DTO.ShoppingList.self).items
        for item in all(ShoppingItem.self) where item.serverID == nil {
            if let index = shopping.firstIndex(where: { normalizeName($0.name) == normalizeName(item.name) && $0.checked == item.checked }) {
                item.serverID = shopping.remove(at: index).id
                item.needsPush = false
            }
        }
        try context.save()
    }

    // MARK: Push

    func push() async throws {
        for tombstone in all(Tombstone.self) {
            let path = switch SyncKind(rawValue: tombstone.kind) {
            case .pantry: "inventory:remove"
            case .recipe: "recipes:remove"
            case .shopping: "shoppingList:deleteItem"
            case nil: ""
            }
            if !path.isEmpty {
                do { _ = try await client.call(path, ["id": tombstone.serverID]) } catch where notFound(error) {}
            }
            context.delete(tombstone)
        }
        for item in all(PantryItem.self) where item.needsPush { try await push(item) }
        for recipe in all(Recipe.self) where recipe.needsPush || recipe.favorited != recipe.syncedFavorited { try await push(recipe) }
        let recipesByUUID = Dictionary(all(Recipe.self).map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        for item in all(ShoppingItem.self) where item.needsPush { try await push(item, recipes: recipesByUUID) }
        try context.save()
    }

    private func push(_ item: PantryItem) async throws {
        var fields: [String: Any] = ["name": item.name, "locationId": item.location.rawValue, "quantity": item.quantity, "unit": item.unit]
        func optional(_ key: String, _ value: Any?) { fields[key] = value ?? NSNull() }
        if let id = item.serverID {
            optional("expiresOn", DayFormat.string(item.expiresOn))
            optional("category", item.category)
            optional("notes", item.notes)
            optional("barcode", item.barcode)
            optional("nutritionPer100g", item.nutrition?.jsonObject)
            do {
                _ = try await client.call("inventory:update", fields.merging(["id": id]) { $1 })
                item.needsPush = false
                return
            } catch where notFound(error) {
                item.serverID = nil
                fields = ["name": item.name, "locationId": item.location.rawValue, "quantity": item.quantity, "unit": item.unit]
            }
        }
        fields.merge(scope) { $1 }
        if let value = DayFormat.string(item.expiresOn) { fields["expiresOn"] = value }
        if let value = item.category { fields["category"] = value }
        if let value = item.notes { fields["notes"] = value }
        if let value = item.barcode { fields["barcode"] = value }
        if let value = item.nutrition?.jsonObject { fields["nutritionPer100g"] = value }
        let created = try await client.call("inventory:create", fields, as: DTO.Created.self)
        item.serverID = created.id
        item.needsPush = false
    }

    private func push(_ recipe: Recipe) async throws {
        if recipe.photoNeedsUpload {
            if let photo = recipe.photo {
                recipe.remotePhotoPath = try? await client.uploadPhoto(ImageTools.compressed(photo) ?? photo)
            } else {
                recipe.remotePhotoPath = nil
            }
            recipe.photoNeedsUpload = false
        }
        let ingredients: [[String: Any]] = recipe.ingredients.map { ingredient in
            var value: [String: Any] = ["name": ingredient.name]
            if let quantity = ingredient.quantity { value["quantity"] = quantity }
            if let unit = ingredient.unit?.nilIfEmpty { value["unit"] = unit }
            if let note = ingredient.note?.nilIfEmpty { value["note"] = note }
            if let label = ingredient.mappingLabel?.nilIfEmpty { value["mapping"] = ["inventoryItemLabel": label] }
            return value
        }
        let steps = recipe.steps.map { ["text": $0.text] }
        let optionals: [(String, Any?)] = [
            ("description", recipe.summary), ("photoUrl", recipe.remotePhotoPath), ("servings", recipe.servings),
            ("totalTimeMinutes", recipe.totalTimeMinutes), ("caloriesKcal", recipe.caloriesKcal), ("proteinGrams", recipe.proteinGrams),
            ("carbsGrams", recipe.carbsGrams), ("fatGrams", recipe.fatGrams), ("sourceUrl", recipe.sourceURL), ("notes", recipe.notes),
        ]
        var fields: [String: Any] = ["title": recipe.title, "tags": recipe.tags, "ingredients": ingredients, "steps": steps]
        var created = false
        if let id = recipe.serverID, recipe.needsPush {
            for (key, value) in optionals { fields[key] = value ?? NSNull() }
            do {
                _ = try await client.call("recipes:update", fields.merging(["id": id]) { $1 })
            } catch where notFound(error) {
                recipe.serverID = nil
            }
        }
        if recipe.serverID == nil {
            fields = ["title": recipe.title, "tags": recipe.tags, "ingredients": ingredients, "steps": steps].merging(scope) { $1 }
            for (key, value) in optionals { if let value { fields[key] = value } }
            let id = try await client.call("recipes:create", fields)
            recipe.serverID = id as? String
            recipe.syncedFavorited = false
            created = true
        }
        if let id = recipe.serverID, recipe.favorited != recipe.syncedFavorited || (created && recipe.favorited) {
            _ = try await client.call("recipes:toggleFavorite", ["id": id])
            recipe.syncedFavorited = recipe.favorited
        }
        recipe.needsPush = false
    }

    private func push(_ item: ShoppingItem, recipes: [UUID: Recipe]) async throws {
        if let id = item.serverID {
            let fields: [String: Any] = ["id": id, "name": item.name, "quantity": item.quantity ?? NSNull(), "unit": item.unit ?? NSNull(),
                                         "category": item.category ?? NSNull(), "checked": item.checked, "note": item.note ?? NSNull()]
            do {
                _ = try await client.call("shoppingList:updateItem", fields)
                item.needsPush = false
                return
            } catch where notFound(error) {
                item.serverID = nil
            }
        }
        var fields: [String: Any] = ["name": item.name, "source": item.source.rawValue].merging(scope) { $1 }
        if let value = item.quantity { fields["quantity"] = value }
        if let value = item.unit { fields["unit"] = value }
        if let value = item.category { fields["category"] = value }
        if let value = item.note { fields["note"] = value }
        if let recipeID = item.recipeUUID.flatMap({ recipes[$0]?.serverID }) ?? item.recipeServerID { fields["recipeId"] = recipeID }
        let created = try await client.call("shoppingList:addItem", fields, as: DTO.Created.self)
        item.serverID = created.id
        if item.checked { _ = try await client.call("shoppingList:updateItem", ["id": created.id, "checked": true]) }
        item.needsPush = false
    }

    // MARK: Pull

    private func pull() async throws {
        let inventory = try await client.call("inventory:list", scope, as: DTO.InventoryList.self).items
        let serverPantry = Set(inventory.map(\.id))
        var localPantry = Dictionary(all(PantryItem.self).compactMap { item in item.serverID.map { ($0, item) } }, uniquingKeysWith: { first, _ in first })
        for remote in inventory {
            let item = localPantry.removeValue(forKey: remote.id) ?? {
                let created = PantryItem(name: remote.name)
                created.serverID = remote.id
                created.needsPush = false
                context.insert(created)
                return created
            }()
            guard !item.needsPush else { continue }
            item.name = remote.name
            item.location = StorageLocation(rawValue: remote.locationId) ?? .pantry
            item.quantity = remote.quantity
            item.unit = remote.unit
            item.expiresOn = DayFormat.date(remote.expiresOn)
            item.category = remote.category
            item.notes = remote.notes
            item.barcode = remote.barcode
            item.nutrition = (remote.nutritionPer100g?.any as? [String: Any]).map(Nutrition.init(json:))
            item.foodFacts = remote.foodFacts.map(FoodFacts.init(json:))
            item.needsPush = false
        }
        for item in all(PantryItem.self) where item.serverID != nil && !serverPantry.contains(item.serverID!) && !item.needsPush {
            context.delete(item)
        }

        let recipes = try await client.call("recipes:list", scope, as: DTO.RecipeList.self).recipes
        let serverRecipes = Set(recipes.map(\.id))
        var localRecipes = Dictionary(all(Recipe.self).compactMap { recipe in recipe.serverID.map { ($0, recipe) } }, uniquingKeysWith: { first, _ in first })
        for remote in recipes {
            let recipe = localRecipes.removeValue(forKey: remote.id) ?? {
                let created = Recipe(title: remote.title)
                created.serverID = remote.id
                created.needsPush = false
                context.insert(created)
                return created
            }()
            guard !recipe.needsPush else { continue }
            recipe.title = remote.title
            recipe.summary = remote.description
            recipe.tags = remote.tags ?? []
            recipe.servings = remote.servings.map { Int($0) }
            recipe.totalTimeMinutes = remote.totalTimeMinutes.map { Int($0) }
            recipe.caloriesKcal = remote.caloriesKcal
            recipe.proteinGrams = remote.proteinGrams
            recipe.carbsGrams = remote.carbsGrams
            recipe.fatGrams = remote.fatGrams
            recipe.sourceURL = remote.sourceUrl
            recipe.notes = remote.notes
            recipe.favorited = remote.favorited
            recipe.syncedFavorited = remote.favorited
            if let cooked = DayFormat.date(remote.lastCookedAt), cooked > (recipe.lastCookedAt ?? .distantPast).addingTimeInterval(86_400) {
                recipe.lastCookedAt = cooked
            }
            // Keep ingredient IDs stable when nothing changed, so views don't jump.
            let ingredients = remote.ingredients.map { Ingredient(name: $0.name, quantity: $0.quantity, unit: $0.unit, note: $0.note, mappingLabel: $0.mapping?.inventoryItemLabel) }
            if recipe.ingredients.map(\.comparable) != ingredients.map(\.comparable) { recipe.ingredients = ingredients }
            if recipe.steps.map(\.text) != remote.steps.map(\.text) { recipe.steps = remote.steps.map { RecipeStep(text: $0.text) } }
            if remote.photoUrl != recipe.remotePhotoPath {
                recipe.remotePhotoPath = remote.photoUrl
                if let path = remote.photoUrl { recipe.photo = try? await client.download(path) } else { recipe.photo = nil }
            }
            recipe.needsPush = false
        }
        for recipe in all(Recipe.self) where recipe.serverID != nil && !serverRecipes.contains(recipe.serverID!) && !recipe.needsPush {
            context.delete(recipe)
        }

        let shopping = try await client.call("shoppingList:get", scope, as: DTO.ShoppingList.self).items
        let serverShopping = Set(shopping.map(\.id))
        let recipeByServerID = Dictionary(all(Recipe.self).compactMap { recipe in recipe.serverID.map { ($0, recipe.uuid) } }, uniquingKeysWith: { first, _ in first })
        var localShopping = Dictionary(all(ShoppingItem.self).compactMap { item in item.serverID.map { ($0, item) } }, uniquingKeysWith: { first, _ in first })
        for remote in shopping {
            let item = localShopping.removeValue(forKey: remote.id) ?? {
                let created = ShoppingItem(name: remote.name)
                created.serverID = remote.id
                created.needsPush = false
                context.insert(created)
                return created
            }()
            guard !item.needsPush else { continue }
            item.name = remote.name
            item.quantity = remote.quantity
            item.unit = remote.unit
            item.category = remote.category
            item.checked = remote.checked
            item.note = remote.note
            item.sourceRaw = remote.source ?? ShoppingSource.manual.rawValue
            item.recipeServerID = remote.recipeId
            item.recipeUUID = remote.recipeId.flatMap { recipeByServerID[$0] }
            item.needsPush = false
        }
        for item in all(ShoppingItem.self) where item.serverID != nil && !serverShopping.contains(item.serverID!) && !item.needsPush {
            context.delete(item)
        }
    }
}

private extension Ingredient {
    var comparable: [String] { [name, quantity.map { String($0) } ?? "", unit ?? "", note ?? "", mappingLabel ?? ""] }
}
