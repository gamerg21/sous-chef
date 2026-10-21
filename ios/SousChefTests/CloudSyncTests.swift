import CloudKit
import Foundation
import Testing
@testable import SousChef

/// iCloud sync without a network: record mapping, merging, and shopping duplicates.
@MainActor
struct CloudSyncTests {
    private let zone = CKRecordZone.ID(zoneName: "Kitchen", ownerName: CKCurrentUserDefaultName)
    private let assets = URL.temporaryDirectory.appending(path: "CloudSyncTests-\(UUID().uuidString)")
    private let when = Date(timeIntervalSinceReferenceDate: 800_000_000.25)

    /// Model → fields → CKRecord → fields → a new model, which must match.
    private func roundTrip<T: CloudSynced>(_ model: T, make: () -> T) throws -> (CKRecord, T) {
        let type = T.cloudRecordType
        let fields = model.cloudFields
        let record = CKRecord(recordType: type.rawValue, recordID: CloudSync.recordID(model.uuid, in: zone))
        try CloudRecordMapping.write(fields, to: record, as: type, assetDirectory: assets)
        let read = CloudRecordMapping.fields(from: record, as: type)
        #expect(read == fields)
        let copy = make()
        copy.applyCloudFields(read)
        #expect(copy.cloudFields == fields)
        return (record, copy)
    }

    @Test func pantryItemRoundTripsWithItsPhotoAsAnAsset() throws {
        let item = PantryItem(name: "Oat milk", location: .fridge, quantity: 1.5, unit: "l")
        item.brand = "Oatly"
        item.expiresOn = when
        item.category = "Dairy"
        item.notes = "Barista"
        item.barcode = "7394376616037"
        item.photo = Data(repeating: 7, count: 4096)
        var nutrition = Nutrition()
        nutrition.energyKcal = 46
        item.nutrition = nutrition
        item.foodFactsJSON = Data("{\"name\":\"Oat\"}".utf8)
        item.createdAt = when
        item.updatedAt = when.addingTimeInterval(60)
        item.serverID = "srv-1"
        item.needsPush = false
        item.syncBase = Data("local".utf8)
        let (record, copy) = try roundTrip(item) { PantryItem(name: "") }
        #expect(record["photo"] is CKAsset)
        #expect(record["needsPush"] == nil && record["syncBase"] == nil)
        #expect(copy.photo == item.photo && copy.location == .fridge && copy.quantity == 1.5 && copy.serverID == "srv-1")
        #expect(copy.nutrition?.energyKcal == 46)
    }

    @Test func pantryItemWithNothingOptionalRoundTrips() throws {
        let item = PantryItem(name: "Rice")
        let (record, copy) = try roundTrip(item) { PantryItem(name: "") }
        #expect(record["photo"] == nil && record["brand"] == nil && record["expiresOn"] == nil)
        #expect(copy.photo == nil && copy.brand == nil && copy.serverID == nil && copy.unit == "each")
    }

    @Test func recipeRoundTripsEveryField() throws {
        let recipe = Recipe(title: "Pesto pasta")
        recipe.summary = "Quick"
        recipe.tags = ["dinner", "vegetarian"]
        recipe.servings = 4
        recipe.totalTimeMinutes = 20
        recipe.caloriesKcal = 610.5
        recipe.proteinGrams = 18
        recipe.carbsGrams = 80
        recipe.fatGrams = 22.25
        recipe.sourceURL = "https://example.com/pesto"
        recipe.notes = "Extra basil"
        recipe.favorited = true
        recipe.lastCookedAt = when
        recipe.photo = Data(repeating: 1, count: 10_000)
        recipe.remotePhotoPath = "/api/files/abc"
        recipe.ingredients = [Ingredient(name: "Basil", quantity: 30, unit: "g")]
        recipe.steps = [RecipeStep(text: "Blend.")]
        recipe.communityAuthor = "Sam"
        recipe.serverID = "r-9"
        recipe.photoNeedsUpload = true
        recipe.syncedFavorited = true
        let (record, copy) = try roundTrip(recipe) { Recipe(title: "") }
        #expect(record["photo"] is CKAsset)
        #expect(record["photoNeedsUpload"] == nil && record["syncedFavorited"] == nil)
        #expect(copy.tags == ["dinner", "vegetarian"] && copy.servings == 4 && copy.favorited)
        #expect(copy.ingredients.map(\.name) == ["Basil"] && copy.steps.map(\.text) == ["Blend."])
        #expect(copy.remotePhotoPath == "/api/files/abc")
    }

    @Test func recipeWithoutOptionalsRoundTrips() throws {
        let (record, copy) = try roundTrip(Recipe(title: "Toast")) { Recipe(title: "") }
        #expect(record["tags"] == nil && record["servings"] == nil)
        #expect(copy.tags.isEmpty && copy.servings == nil && copy.photo == nil && !copy.favorited)
    }

    @Test func shoppingItemRoundTrips() throws {
        let item = ShoppingItem(name: "Milk", quantity: 2, unit: "l", source: .fromRecipe)
        item.category = "Dairy"
        item.checked = true
        item.note = "Whole"
        item.recipeUUID = UUID()
        item.recipeServerID = "r-1"
        item.serverID = "s-1"
        let (_, copy) = try roundTrip(item) { ShoppingItem(name: "") }
        #expect(copy.recipeUUID == item.recipeUUID && copy.source == .fromRecipe && copy.checked)
        let (_, bare) = try roundTrip(ShoppingItem(name: "Eggs")) { ShoppingItem(name: "") }
        #expect(bare.quantity == nil && bare.unit == nil && bare.recipeUUID == nil && !bare.checked)
    }

    @Test func plannedMealRoundTrips() throws {
        let meal = PlannedMeal(day: "2026-10-19", slot: .lunch)
        meal.recipeUUID = UUID()
        meal.recipeServerID = "r-2"
        meal.servings = 3
        meal.note = "Leftovers"
        meal.cookedAt = when
        let (_, copy) = try roundTrip(meal) { PlannedMeal(day: "") }
        #expect(copy.slot == .lunch && copy.servings == 3 && copy.cookedAt == when)
        let (_, bare) = try roundTrip(PlannedMeal(day: "2026-10-20")) { PlannedMeal(day: "") }
        #expect(bare.recipeUUID == nil && bare.cookedAt == nil && bare.slot == .dinner)
    }

    @Test func pantryOutcomeRoundTrips() throws {
        let outcome = PantryOutcome(name: "Spinach", outcome: .wasted, on: "2026-10-19", expiresOn: "2026-10-17")
        outcome.serverID = "o-1"
        let (_, copy) = try roundTrip(outcome) { PantryOutcome(name: "", outcome: .used, on: "") }
        #expect(copy.outcome == .wasted && copy.expiresOn == "2026-10-17")
        let (_, bare) = try roundTrip(PantryOutcome(name: "Bread", outcome: .used, on: "2026-10-19")) { PantryOutcome(name: "", outcome: .wasted, on: "") }
        #expect(bare.expiresOn == nil && bare.outcome == .used)
    }

    @Test func modelsInsertedFromICloudPushToAServerOnlyWithoutAServerID() {
        let linked = PantryItem(name: "Milk")
        linked.serverID = "x"
        linked.preparedFromCloud()
        #expect(!linked.needsPush)
        let recipe = Recipe(title: "Soup")
        recipe.photo = Data([1])
        recipe.preparedFromCloud()
        #expect(recipe.needsPush && recipe.photoNeedsUpload)
    }

    @Test func writingOnTopOfABaseSendsOnlyChangedFields() throws {
        let item = PantryItem(name: "Flour", quantity: 1, unit: "kg")
        item.photo = Data(repeating: 3, count: 100)
        let base = CloudMerge.digest(item.cloudFields)
        item.quantity = 0.5
        item.notes = "Bread flour"
        let record = CKRecord(recordType: "PantryItem", recordID: CloudSync.recordID(item.uuid, in: zone))
        let files = try CloudRecordMapping.write(item.cloudFields, to: record, as: .pantryItem, base: base, assetDirectory: assets)
        #expect(files.isEmpty)
        #expect(Set(record.changedKeys()) == ["quantity", "notes"])
        // A cleared field is written as nil.
        item.notes = nil
        let cleared = CKRecord(recordType: "PantryItem", recordID: record.recordID)
        try CloudRecordMapping.write(item.cloudFields, to: cleared, as: .pantryItem, base: CloudMerge.digest(PantryItem(name: "Flour").cloudFields.merging(["notes": .string("x")]) { $1 }), assetDirectory: assets)
        #expect(cleared.changedKeys().contains("notes") && cleared["notes"] == nil)
    }

    @Test func systemFieldsRoundTrip() throws {
        let record = CKRecord(recordType: "Recipe", recordID: CKRecord.ID(recordName: UUID().uuidString, zoneID: zone))
        record["title"] = "Soup"
        let data = CloudRecordMapping.encodeSystemFields(of: record)
        let decoded = try #require(CloudRecordMapping.record(fromSystemFields: data))
        #expect(decoded.recordID == record.recordID && decoded.recordType == "Recipe")
        #expect(decoded["title"] == nil)
    }

    @Test func basesStoreDigestsInsteadOfPhotos() throws {
        let fields: CloudFields = ["photo": .bytes(Data(repeating: 9, count: 50_000)), "name": .string("Milk")]
        let digest = CloudMerge.digest(fields)
        guard case .string(let hash) = digest["photo"] else { Issue.record("photo wasn't digested"); return }
        #expect(hash.hasPrefix("sha256:") && hash.count == 71)
        #expect(digest["name"] == .string("Milk"))
        #expect(CloudRecordMapping.decode(CloudRecordMapping.encode(digest)) == digest)
    }

    // MARK: Merge

    private let base: CloudFields = ["name": .string("Milk"), "quantity": .double(2), "unit": .string("l"),
                                     "notes": .string("Oat"), "updatedAt": .date(Date(timeIntervalSinceReferenceDate: 100))]

    @Test func mergeKeepsLocalEditsAndTakesServerEdits() {
        var local = base
        local["notes"] = .string("Soy")
        var server = base
        server["name"] = .string("Milk (oat)")
        server["category"] = .string("Dairy")
        let merged = CloudMerge.merge(.pantryItem, local: local, server: server, base: CloudMerge.digest(base))
        #expect(merged["notes"] == .string("Soy"))
        #expect(merged["name"] == .string("Milk (oat)"))
        #expect(merged["category"] == .string("Dairy"))
        #expect(merged["quantity"] == .double(2))
    }

    @Test func sameFieldChangedOnBothSidesKeepsThisDevicesValue() {
        var local = base
        local["notes"] = .string("Soy")
        local["updatedAt"] = .date(Date(timeIntervalSinceReferenceDate: 200))
        var server = base
        server["notes"] = .string("Almond")
        server["updatedAt"] = .date(Date(timeIntervalSinceReferenceDate: 300))
        let merged = CloudMerge.merge(.pantryItem, local: local, server: server, base: CloudMerge.digest(base))
        #expect(merged["notes"] == .string("Soy"))
        #expect(merged["updatedAt"] == .date(Date(timeIntervalSinceReferenceDate: 300)))
        // Clearing a field here counts as an edit too.
        local["notes"] = nil
        #expect(CloudMerge.merge(.pantryItem, local: local, server: server, base: CloudMerge.digest(base))["notes"] == nil)
    }

    @Test func pantryAmountsChangedOnBothSidesAddUp() {
        var local = base
        local["quantity"] = .double(1.5)    // used 0.5 here
        var server = base
        server["quantity"] = .double(1.25)  // used 0.75 elsewhere
        #expect(CloudMerge.merge(.pantryItem, local: local, server: server, base: CloudMerge.digest(base))["quantity"] == .double(0.75))
        // Never below zero.
        local["quantity"] = .double(0)
        server["quantity"] = .double(0.5)
        #expect(CloudMerge.merge(.pantryItem, local: local, server: server, base: CloudMerge.digest(base))["quantity"] == .double(0))
    }

    @Test func pantryAmountsInAChangedUnitKeepThisDevicesValue() {
        var local = base
        local["quantity"] = .double(500)
        local["unit"] = .string("ml")
        var server = base
        server["quantity"] = .double(1)
        let merged = CloudMerge.merge(.pantryItem, local: local, server: server, base: CloudMerge.digest(base))
        #expect(merged["quantity"] == .double(500) && merged["unit"] == .string("ml"))
        // Shopping amounts never add up: this device's value wins.
        var shopLocal = base, shopServer = base
        shopLocal["quantity"] = .double(3)
        shopServer["quantity"] = .double(4)
        #expect(CloudMerge.merge(.shoppingItem, local: shopLocal, server: shopServer, base: CloudMerge.digest(base))["quantity"] == .double(3))
    }

    @Test func photosMergeByDigest() {
        let photo = CloudValue.bytes(Data(repeating: 1, count: 64))
        var original = base
        original["photo"] = photo
        var server = original
        server["photo"] = .bytes(Data(repeating: 2, count: 64))
        let merged = CloudMerge.merge(.pantryItem, local: original, server: server, base: CloudMerge.digest(original))
        #expect(merged["photo"] == server["photo"])
    }

    @Test func withoutABaseTheNewerRecordWins() {
        var local = base
        local["notes"] = .string("Local")
        local["updatedAt"] = .date(Date(timeIntervalSinceReferenceDate: 500))
        var server = base
        server["notes"] = .string("Server")
        #expect(CloudMerge.merge(.pantryItem, local: local, server: server, base: nil)["notes"] == .string("Local"))
        server["updatedAt"] = .date(Date(timeIntervalSinceReferenceDate: 600))
        #expect(CloudMerge.merge(.pantryItem, local: local, server: server, base: nil)["notes"] == .string("Server"))
    }

    // MARK: Shopping duplicates

    private func line(_ name: String, unit: String? = nil, checked: Bool = false, at seconds: Double, quantity: Double? = nil,
                      category: String? = nil, note: String? = nil) -> ShoppingDuplicates.Line {
        ShoppingDuplicates.Line(uuid: UUID(), name: name, unit: unit, checked: checked, createdAt: Date(timeIntervalSinceReferenceDate: seconds),
                                quantity: quantity, category: category, note: note)
    }

    @Test func duplicateShoppingItemsCollapseIntoTheOlderOne() {
        let older = line("Milk", unit: "l", at: 10, quantity: 1)
        let newer = line("  milk ", unit: "l", at: 20, quantity: 2, category: "Dairy", note: "Oat")
        let other = line("Milk", unit: "gal", at: 5)
        let checked = line("Milk", unit: "l", checked: true, at: 1)
        let result = ShoppingDuplicates.find(in: [newer, other, checked, older])
        #expect(result == [ShoppingDuplicates.Collapse(keep: older.uuid, quantity: 2, category: "Dairy", note: "Oat", delete: [newer.uuid])])
    }

    @Test func shoppingDuplicatesTreatNoUnitAsEmptyAndKeepFilledFields() {
        let first = line("Eggs", at: 1, category: "Dairy")
        let second = line("EGGS", unit: "", at: 2, note: "Free range")
        let third = line("eggs", unit: nil, at: 3, quantity: 12, category: "Other")
        let result = ShoppingDuplicates.find(in: [third, second, first])
        #expect(result.count == 1)
        #expect(result.first?.keep == first.uuid)
        #expect(result.first?.quantity == 12)
        #expect(result.first?.category == "Dairy")
        #expect(result.first?.note == "Free range")
        #expect(Set(result.first?.delete ?? []) == [second.uuid, third.uuid])
        #expect(ShoppingDuplicates.find(in: [first, line("Bread", at: 2)]).isEmpty)
    }

    // MARK: Kitchen

    @Test func inMemoryKitchensNeverSyncWithICloud() {
        let previous = UserDefaults.standard.object(forKey: "icloud.enabled")
        defer { UserDefaults.standard.set(previous, forKey: "icloud.enabled") }
        let kitchen = Kitchen(inMemory: true)
        kitchen.setICloud(true)
        #expect(!kitchen.usesICloud)
        #expect(kitchen.cloud.status == .off)
        kitchen.addShopping("Milk")
        #expect(kitchen.fetch(ShoppingItem.self).count == 1)
    }

    @Test func scopeEncodesForOtherDevices() {
        let scope = CloudSync.Scope.household(zoneName: "Kitchen", ownerName: "_abc")
        #expect(CloudSync.decodeScope(CloudSync.encodeScope(scope)) == scope)
        #expect(CloudSync.decodeScope(CloudSync.encodeScope(.personal)) == .personal)
    }
}
