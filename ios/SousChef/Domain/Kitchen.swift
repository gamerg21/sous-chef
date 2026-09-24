import CloudKit
import CoreData
import Foundation
import MachO
import Observation
import SwiftData

/// The app's single source of kitchen actions. Views read models through
/// `@Query`; anything that changes stock, deletes, or needs to reach the
/// companion server goes through here so tombstones and syncing stay right.
@Observable
final class Kitchen {
    /// The kitchen the app and its Siri intents share. `-uiTesting` keeps it in memory.
    static let shared = Kitchen(inMemory: ProcessInfo.processInfo.arguments.contains("-uiTesting"))
    static let cloudContainerID = "iCloud.com.georgevina.souschef"

    private(set) var container: ModelContainer
    private(set) var usesICloud: Bool
    /// Changes when the store is reopened, so views rebuild on the new container.
    private(set) var storeGeneration = 0
    let ai = KitchenAI()
    let server = CompanionServer()
    private let inMemory: Bool

    var context: ModelContext { container.mainContext }

    init(inMemory: Bool = false) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-initCloudKitSchema") { Self.initializeCloudKitSchema() }
        #endif
        self.inMemory = inMemory
        (container, usesICloud) = Self.openStore(inMemory: inMemory, cloud: Self.iCloudPreferred)
        server.kitchen = self
        ai.serverConnected = { [weak server] in server?.isConnected ?? false }
        ai.serverGenerate = { [weak server] preferences in
            guard let server else { throw ServerClient.ServerError.notAuthenticated }
            return try await server.generateRecipe(preferences: preferences)
        }
    }

    #if DEBUG
    /// Creates every record type and field in the CloudKit development
    /// environment, so the schema can be deployed to production before a
    /// TestFlight or App Store build. Run once from Xcode on a device signed
    /// in to iCloud with the `-initCloudKitSchema` launch argument.
    private static func initializeCloudKitSchema() {
        guard hasCloudKitEntitlement, let model = NSManagedObjectModel.makeManagedObjectModel(for: KitchenSchema.models) else { return }
        let url = URL.temporaryDirectory.appending(path: "schema-\(UUID().uuidString).store")
        let description = NSPersistentStoreDescription(url: url)
        description.cloudKitContainerOptions = NSPersistentCloudKitContainerOptions(containerIdentifier: cloudContainerID)
        description.shouldAddStoreAsynchronously = false
        let container = NSPersistentCloudKitContainer(name: "SchemaSetup", managedObjectModel: model)
        container.persistentStoreDescriptions = [description]
        container.loadPersistentStores { _, error in
            if let error { print("CloudKit schema store failed: \(error)") }
        }
        do {
            try container.initializeCloudKitSchema()
            print("CloudKit schema initialized. Deploy it to production in the CloudKit Console.")
        } catch {
            print("CloudKit schema initialization failed: \(error)")
        }
        for store in container.persistentStoreCoordinator.persistentStores {
            try? container.persistentStoreCoordinator.remove(store)
        }
        try? FileManager.default.removeItem(at: url)
    }
    #endif

    // MARK: iCloud

    static var iCloudPreferred: Bool {
        get { UserDefaults.standard.object(forKey: "icloud.enabled") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "icloud.enabled") }
    }

    var iCloudAvailable: Bool { !inMemory && Self.hasCloudKitEntitlement }

    /// The local store and the iCloud-mirrored store are the same file, so
    /// switching only changes whether it mirrors to the private database.
    /// SwiftData records history either way, so edits made while sync was off
    /// upload when it's turned back on.
    private static func openStore(inMemory: Bool, cloud: Bool) -> (ModelContainer, Bool) {
        let schema = Schema(KitchenSchema.models)
        if cloud && !inMemory && hasCloudKitEntitlement,
           let container = try? ModelContainer(for: schema, configurations: ModelConfiguration(schema: schema, cloudKitDatabase: .private(cloudContainerID))) {
            return (container, true)
        }
        do {
            let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory, cloudKitDatabase: .none)
            return (try ModelContainer(for: schema, configurations: configuration), false)
        } catch {
            fatalError("Sous Chef couldn't open its kitchen database: \(error)")
        }
    }

    /// Turns iCloud sync on or off without restarting the app.
    func setICloud(_ enabled: Bool) {
        Self.iCloudPreferred = enabled
        guard iCloudAvailable, enabled != usesICloud else { return }
        try? context.save()
        (container, usesICloud) = Self.openStore(inMemory: inMemory, cloud: enabled)
        storeGeneration += 1
    }

    /// Stops syncing and deletes the kitchen from the person's iCloud. This
    /// device keeps its copy; other devices clear theirs on their next sync.
    func deleteICloudData() async throws {
        setICloud(false)
        let zone = CKRecordZone.ID(zoneName: "com.apple.coredata.cloudkit.zone", ownerName: CKCurrentUserDefaultName)
        do {
            try await CKContainer(identifier: Self.cloudContainerID).privateCloudDatabase.deleteRecordZone(withID: zone)
        } catch let error as CKError where error.code == .zoneNotFound {
            // Nothing in iCloud yet.
        }
    }

    /// CloudKit traps when the app lacks the iCloud entitlement, which happens
    /// only for unsigned simulator builds. Device builds can't run unsigned.
    static var hasCloudKitEntitlement: Bool { Entitlements.contains(cloudContainerID) }

    // MARK: Saving

    /// Saves and lets the companion server know there is something to send.
    func changed() {
        try? context.save()
        server.scheduleSync()
    }

    func fetch<T: PersistentModel>(_ type: T.Type) -> [T] {
        (try? context.fetch(FetchDescriptor<T>())) ?? []
    }

    // MARK: Deleting

    func delete(_ item: PantryItem) {
        if let id = item.serverID { context.insert(Tombstone(kind: .pantry, serverID: id)) }
        context.delete(item)
    }

    func delete(_ recipe: Recipe) {
        if let id = recipe.serverID { context.insert(Tombstone(kind: .recipe, serverID: id)) }
        context.delete(recipe)
    }

    func delete(_ item: ShoppingItem) {
        if let id = item.serverID { context.insert(Tombstone(kind: .shopping, serverID: id)) }
        context.delete(item)
    }

    // MARK: Pantry

    func stock() -> [StockLine] {
        fetch(PantryItem.self).map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
    }

    func adjust(_ item: PantryItem, by delta: Double) {
        let next = max(0, item.quantity + delta)
        item.quantity = (next * 1000).rounded() / 1000
        item.touch()
        changed()
    }

    // MARK: Cooking

    func plan(for recipe: Recipe) -> CookingPlan {
        CookingPlanner.plan(ingredients: recipe.ingredients, stock: stock())
    }

    struct CookResult {
        var plan: CookingPlan
        var addedToShopping: Int
        var onServer: Bool
    }

    /// Deducts the recipe from the pantry. With a companion server, the server
    /// does it atomically; offline, the same plan is applied here.
    func cook(_ recipe: Recipe, addMissing: Bool) async -> CookResult {
        let plan = plan(for: recipe)
        if server.isConnected, recipe.serverID != nil {
            do {
                if try await server.cookOnServer(recipe, addMissing: addMissing) {
                    return CookResult(plan: plan, addedToShopping: addMissing ? plan.missingIngredients.count : 0, onServer: true)
                }
            } catch {
                // Offline or unreachable: fall through and cook locally.
            }
        }
        let items = Dictionary(fetch(PantryItem.self).map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        for deduction in plan.deductions {
            guard let item = items[deduction.id] else { continue }
            if deduction.remaining <= 0.000001 { delete(item) }
            else {
                item.quantity = deduction.remaining
                item.touch()
            }
        }
        recipe.lastCookedAt = Date()
        let added = addMissing ? addShortages(for: recipe, missing: plan.missingIngredients) : 0
        changed()
        return CookResult(plan: plan, addedToShopping: added, onServer: false)
    }

    /// Adds what a recipe still needs; repeating it tops up rather than doubles.
    @discardableResult
    func addShortages(for recipe: Recipe, missing: [CookingPlan.Missing]? = nil) -> Int {
        let missing = missing ?? plan(for: recipe).missingIngredients
        var grouped: [String: CookingPlan.Missing] = [:]
        var order: [String] = []
        for item in missing {
            let key = normalizeName(item.name) + "|" + (item.unit ?? "")
            if let previous = grouped[key] {
                grouped[key]?.quantity = previous.quantity == nil || item.quantity == nil ? nil : previous.quantity! + item.quantity!
            } else {
                grouped[key] = item
                order.append(key)
            }
        }
        let existing = fetch(ShoppingItem.self)
        var added = 0
        for key in order {
            guard let item = grouped[key] else { continue }
            let matches = existing.filter { !$0.checked && $0.recipeUUID == recipe.uuid && normalizeName($0.name) == normalizeName(item.name) && ($0.unit ?? "") == (item.unit ?? "") }
            if let first = matches.first {
                let amount = matches.reduce(0) { $0 + ($1.quantity ?? 0) }
                if let quantity = item.quantity, amount < quantity {
                    first.quantity = (first.quantity ?? 0) + quantity - amount
                    first.touch()
                    added += 1
                }
            } else {
                let entry = ShoppingItem(name: item.name, quantity: item.quantity, unit: item.unit, source: .fromRecipe)
                entry.recipeUUID = recipe.uuid
                entry.recipeServerID = recipe.serverID
                entry.category = categoryGuess(for: item.name)
                context.insert(entry)
                added += 1
            }
        }
        changed()
        return added
    }

    // MARK: Shopping

    func addShopping(_ name: String, quantity: Double? = nil, unit: String? = nil) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let parsed = IngredientParser.parse(trimmed)
        let item = ShoppingItem(name: parsed.quantity == nil ? trimmed : parsed.name, quantity: quantity ?? parsed.quantity, unit: unit ?? (parsed.quantity == nil ? nil : parsed.unit))
        item.note = parsed.quantity == nil ? nil : parsed.note
        item.category = categoryGuess(for: item.name)
        context.insert(item)
        changed()
    }

    func toggle(_ item: ShoppingItem) {
        item.checked.toggle()
        item.touch()
        changed()
    }

    func clearChecked() {
        for item in fetch(ShoppingItem.self) where item.checked { delete(item) }
        changed()
    }

    struct Purchase: Identifiable {
        let item: ShoppingItem
        var quantity: Double
        var unit: String
        var location: StorageLocation
        var expiresOn: Date?
        var id: UUID { item.uuid }
    }

    /// Moves bought items into the pantry. An empty placeholder of the same
    /// food and unit is filled in place; otherwise each purchase is a batch.
    func stock(_ purchases: [Purchase]) {
        let pantry = fetch(PantryItem.self)
        for purchase in purchases where purchase.quantity > 0 {
            let unit = purchase.unit.trimmingCharacters(in: .whitespaces)
            if let placeholder = pantry.first(where: { normalizeName($0.name) == normalizeName(purchase.item.name) && $0.quantity <= 0 && normalizeName($0.unit) == normalizeName(unit) }) {
                placeholder.quantity = purchase.quantity
                placeholder.unit = unit
                placeholder.location = purchase.location
                placeholder.expiresOn = purchase.expiresOn
                placeholder.category = placeholder.category ?? purchase.item.category
                placeholder.touch()
            } else {
                let item = PantryItem(name: purchase.item.name, location: purchase.location, quantity: purchase.quantity, unit: unit)
                item.expiresOn = purchase.expiresOn
                item.category = purchase.item.category
                item.notes = purchase.item.note
                context.insert(item)
            }
            delete(purchase.item)
        }
        changed()
    }

    /// Store-aisle guess used until Apple Intelligence categorizes the list.
    func categoryGuess(for name: String) -> String? {
        let text = name.lowercased()
        let rules: [(String, String)] = [
            (#"apple|banana|lettuce|tomato|onion|garlic|pepper|carrot|potato|lemon|lime|herb|spinach|berry|avocado|cucumber|celery|mushroom|ginger|cilantro|parsley|basil|fruit|vegetable"#, "Produce"),
            (#"milk|cheese|yogurt|yoghurt|butter|cream|egg"#, "Dairy"),
            (#"chicken|beef|pork|lamb|turkey|bacon|sausage|fish|salmon|tuna|shrimp|meat"#, "Meat & Seafood"),
            (#"frozen|ice cream"#, "Frozen"),
            (#"bread|bun|roll|bagel|tortilla|pastry"#, "Bakery"),
            (#"juice|soda|coffee|tea|water|wine|beer"#, "Beverages"),
            (#"canned|can of|beans"#, "Canned Goods"),
            (#"rice|oat|quinoa|flour|cereal|grain"#, "Grains & Rice"),
            (#"pasta|noodle|spaghetti|macaroni"#, "Pasta & Noodles"),
            (#"salt|cumin|paprika|cinnamon|oregano|thyme|spice|seasoning"#, "Spices & Seasonings"),
            (#"sauce|ketchup|mustard|mayo|vinegar|oil|dressing|soy"#, "Condiments & Sauces"),
            (#"chip|cracker|cookie|chocolate|snack|candy"#, "Snacks"),
        ]
        return rules.first { text.range(of: $0.0, options: .regularExpression) != nil }?.1
    }

    // MARK: Recipes

    @discardableResult
    func save(_ draft: RecipeDraft, into recipe: Recipe? = nil) -> Recipe {
        let target = recipe ?? Recipe(title: draft.title)
        target.title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        target.summary = draft.summary?.nilIfEmpty
        target.servings = draft.servings
        target.totalTimeMinutes = draft.totalTimeMinutes
        target.caloriesKcal = draft.caloriesKcal
        target.proteinGrams = draft.proteinGrams
        target.carbsGrams = draft.carbsGrams
        target.fatGrams = draft.fatGrams
        target.tags = draft.tags
        target.sourceURL = draft.sourceURL?.nilIfEmpty
        target.notes = draft.notes?.nilIfEmpty
        target.ingredients = draft.ingredients.filter { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }
        target.steps = draft.steps.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
        if target.photo != draft.photo {
            target.photo = draft.photo
            target.photoNeedsUpload = true
        }
        target.touch()
        if recipe == nil { context.insert(target) }
        changed()
        return target
    }

    func draft(from recipe: Recipe) -> RecipeDraft {
        RecipeDraft(title: recipe.title, summary: recipe.summary, servings: recipe.servings, totalTimeMinutes: recipe.totalTimeMinutes,
                    caloriesKcal: recipe.caloriesKcal, proteinGrams: recipe.proteinGrams, carbsGrams: recipe.carbsGrams, fatGrams: recipe.fatGrams,
                    tags: recipe.tags, sourceURL: recipe.sourceURL, notes: recipe.notes, ingredients: recipe.ingredients, steps: recipe.steps, photo: recipe.photo)
    }

    // MARK: Server links

    func removeAllServerLinkedData() {
        for item in fetch(PantryItem.self) where item.serverID != nil { context.delete(item) }
        for recipe in fetch(Recipe.self) where recipe.serverID != nil { context.delete(recipe) }
        for item in fetch(ShoppingItem.self) where item.serverID != nil { context.delete(item) }
        for tombstone in fetch(Tombstone.self) { context.delete(tombstone) }
        try? context.save()
    }

    func unlinkFromServer() {
        for item in fetch(PantryItem.self) { item.serverID = nil; item.needsPush = true }
        for recipe in fetch(Recipe.self) {
            recipe.serverID = nil
            recipe.needsPush = true
            recipe.syncedFavorited = false
            recipe.remotePhotoPath = nil
            recipe.photoNeedsUpload = recipe.photo != nil
        }
        for item in fetch(ShoppingItem.self) { item.serverID = nil; item.needsPush = true; item.recipeServerID = nil }
        for tombstone in fetch(Tombstone.self) { context.delete(tombstone) }
        try? context.save()
    }

    // MARK: Import / export (same JSON as the web app's recipe export)

    func exportRecipes() throws -> Data {
        let recipes: [[String: Any]] = fetch(Recipe.self).sorted { $0.createdAt < $1.createdAt }.map { recipe in
            var value: [String: Any] = ["title": recipe.title, "tags": recipe.tags,
                                        "ingredients": recipe.ingredients.map { ingredient -> [String: Any] in
                                            var item: [String: Any] = ["name": ingredient.name]
                                            if let quantity = ingredient.quantity { item["quantity"] = quantity }
                                            if let unit = ingredient.unit { item["unit"] = unit }
                                            if let note = ingredient.note { item["note"] = note }
                                            return item
                                        },
                                        "steps": recipe.steps.map(\.text)]
            let optionals: [(String, Any?)] = [("description", recipe.summary), ("servings", recipe.servings), ("totalTimeMinutes", recipe.totalTimeMinutes),
                                               ("caloriesKcal", recipe.caloriesKcal), ("proteinGrams", recipe.proteinGrams), ("carbsGrams", recipe.carbsGrams),
                                               ("fatGrams", recipe.fatGrams), ("sourceUrl", recipe.sourceURL), ("notes", recipe.notes)]
            for (key, item) in optionals { if let item { value[key] = item } }
            if let photo = recipe.photo.flatMap({ ImageTools.compressed($0, maxDimension: 1024) }), photo.count < 500_000 {
                value["photoDataUrl"] = "data:image/jpeg;base64,\(photo.base64EncodedString())"
            }
            return value
        }
        return try JSONSerialization.data(withJSONObject: ["recipes": recipes], options: [.prettyPrinted, .sortedKeys])
    }

    func importRecipes(from data: Data) throws -> Int {
        let raw = try JSONSerialization.jsonObject(with: data)
        guard let list = (raw as? [Any]) ?? ((raw as? [String: Any])?["recipes"] as? [Any]) else {
            throw CocoaError(.fileReadCorruptFile, userInfo: [NSLocalizedDescriptionKey: "Expected an array of recipes or { recipes: [...] }"])
        }
        var count = 0
        for case let entry as [String: Any] in list.prefix(500) {
            guard let title = (entry["title"] as? String)?.nilIfEmpty else { continue }
            func number(_ key: String) -> Double? { (entry[key] as? Double) ?? (entry[key] as? Int).map(Double.init) }
            var draft = RecipeDraft(title: title)
            draft.summary = entry["description"] as? String
            draft.tags = (entry["tags"] as? [String]) ?? []
            draft.servings = number("servings").map { Int($0) }
            draft.totalTimeMinutes = number("totalTimeMinutes").map { Int($0) }
            draft.caloriesKcal = number("caloriesKcal")
            draft.proteinGrams = number("proteinGrams")
            draft.carbsGrams = number("carbsGrams")
            draft.fatGrams = number("fatGrams")
            draft.sourceURL = entry["sourceUrl"] as? String
            draft.notes = entry["notes"] as? String
            draft.ingredients = ((entry["ingredients"] as? [Any]) ?? []).prefix(200).compactMap { value in
                if let line = value as? String { return IngredientParser.parse(line) }
                guard let item = value as? [String: Any], let name = (item["name"] as? String)?.nilIfEmpty else { return nil }
                let quantity = (item["quantity"] as? Double) ?? (item["quantity"] as? Int).map(Double.init)
                return Ingredient(name: name, quantity: quantity, unit: item["unit"] as? String, note: item["note"] as? String)
            }
            draft.steps = ((entry["steps"] as? [Any]) ?? []).prefix(200).compactMap { value in
                ((value as? String) ?? (value as? [String: Any])?["text"] as? String)?.nilIfEmpty.map { RecipeStep(text: $0) }
            }
            if let dataURL = entry["photoDataUrl"] as? String, let comma = dataURL.firstIndex(of: ",") {
                draft.photo = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]))
            }
            save(draft)
            count += 1
        }
        return count
    }
}

nonisolated enum Entitlements {
    /// Frameworks such as CloudKit and Private Cloud Compute trap when an
    /// entitlement is missing, so check what this build was signed with.
    static func contains(_ text: String) -> Bool {
        signed?.contains(text) ?? false
    }

    private static let signed: String? = {
        #if targetEnvironment(simulator)
        // Simulator builds carry their entitlements in the executable itself.
        if let header = _dyld_get_image_header(0) {
            var size: UInt = 0
            let section = header.withMemoryRebound(to: mach_header_64.self, capacity: 1) {
                getsectiondata($0, "__TEXT", "__entitlements", &size)
            }
            if let section, size > 0 {
                return String(decoding: UnsafeBufferPointer(start: section, count: Int(size)), as: UTF8.self)
            }
        }
        #endif
        return Bundle.main.executableURL.flatMap { try? Data(contentsOf: $0, options: .mappedIfSafe) }.flatMap(fromCodeSignature)
    }()

    /// Reads the entitlements blob from a thin 64-bit Mach-O's code signature.
    static func fromCodeSignature(_ binary: Data) -> String? {
        func little(_ offset: Int) -> UInt32? {
            guard offset >= 0, offset + 4 <= binary.count else { return nil }
            return binary.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }.littleEndian
        }
        func big(_ offset: Int) -> UInt32? {
            guard offset >= 0, offset + 4 <= binary.count else { return nil }
            return binary.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: offset, as: UInt32.self) }.bigEndian
        }
        guard little(0) == MH_MAGIC_64, let commandCount = little(16) else { return nil }
        var offset = 32
        for _ in 0..<commandCount {
            guard let command = little(offset), let size = little(offset + 4), size > 0 else { return nil }
            if command == UInt32(LC_CODE_SIGNATURE), let signature = little(offset + 8).map(Int.init) {
                // A big-endian SuperBlob indexing the signature's blobs.
                guard big(signature) == 0xFADE0CC0, let count = big(signature + 8) else { return nil }
                for index in 0..<Int(count) {
                    guard let blob = big(signature + 12 + index * 8 + 4).map({ signature + Int($0) }),
                          big(blob) == 0xFADE7171, let length = big(blob + 4), length > 8,
                          blob + Int(length) <= binary.count else { continue }
                    return String(decoding: binary[(blob + 8)..<(blob + Int(length))], as: UTF8.self)
                }
                return nil
            }
            offset += Int(size)
        }
        return nil
    }
}
