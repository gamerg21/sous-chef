import Foundation
import SwiftData

// Every model follows CloudKit's rules: no unique constraints, and every
// stored property is optional or has a default. That lets the same store
// sync through the person's private iCloud database.
//
// `serverID` and `needsPush` belong to the optional companion-server sync.
// They live in the synced store so any of the person's devices can push.

nonisolated enum StorageLocation: String, CaseIterable, Identifiable, Codable {
    case pantry, fridge, freezer

    var id: String { rawValue }
    var title: String {
        switch self {
        case .pantry: "Pantry"
        case .fridge: "Fridge"
        case .freezer: "Freezer"
        }
    }
    var symbol: String {
        switch self {
        case .pantry: "cabinet"
        case .fridge: "refrigerator"
        case .freezer: "snowflake"
        }
    }

    /// Mirrors the server's `locationNameToId`.
    init(serverName: String) {
        let lower = serverName.lowercased()
        if lower.contains("fridge") || lower.contains("refrigerator") { self = .fridge }
        else if lower.contains("freezer") { self = .freezer }
        else { self = .pantry }
    }
}

@Model
final class PantryItem {
    var uuid: UUID = UUID()
    var name: String = ""
    /// Local to the app: the server keeps brands only on barcode records.
    var brand: String?
    var locationRaw: String = StorageLocation.pantry.rawValue
    var quantity: Double = 1
    var unit: String = "each"
    var expiresOn: Date?
    var category: String?
    var notes: String?
    var barcode: String?
    @Attribute(.externalStorage) var photo: Data?
    var nutritionJSON: Data?
    var foodFactsJSON: Data?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var serverID: String?
    var needsPush: Bool = true

    init(name: String, location: StorageLocation = .pantry, quantity: Double = 1, unit: String = "each") {
        self.name = name
        self.locationRaw = location.rawValue
        self.quantity = quantity
        self.unit = unit
    }

    var location: StorageLocation {
        get { StorageLocation(rawValue: locationRaw) ?? .pantry }
        set { locationRaw = newValue.rawValue }
    }

    var nutrition: Nutrition? {
        get { nutritionJSON.flatMap { try? JSONDecoder().decode(Nutrition.self, from: $0) } }
        set { nutritionJSON = newValue.flatMap { $0.isEmpty ? nil : try? JSONEncoder().encode($0) } }
    }

    var foodFacts: FoodFacts? {
        get { foodFactsJSON.flatMap { try? JSONDecoder().decode(FoodFacts.self, from: $0) } }
        set { foodFactsJSON = newValue.flatMap { try? JSONEncoder().encode($0) } }
    }

    /// Nutrition entered by hand wins over barcode facts, as on the web.
    var effectiveNutrition: Nutrition? { nutrition ?? foodFacts?.nutrition }

    func touch() {
        updatedAt = Date()
        needsPush = true
    }
}

nonisolated struct Ingredient: Codable, Hashable, Identifiable {
    var id = UUID()
    var name: String
    var quantity: Double?
    var unit: String?
    var note: String?
    /// Name of the pantry item this ingredient draws from, when it differs.
    var mappingLabel: String?

    var pantryName: String { (mappingLabel?.isEmpty == false ? mappingLabel : nil) ?? name }

    /// Editor-friendly views of the optional fields; empty text means "not set".
    var unitText: String {
        get { unit ?? "" }
        set { unit = newValue.isEmpty ? nil : newValue }
    }

    var noteText: String {
        get { note ?? "" }
        set { note = newValue.isEmpty ? nil : newValue }
    }

    var mappingText: String {
        get { mappingLabel ?? "" }
        set { mappingLabel = newValue.isEmpty ? nil : newValue }
    }
}

nonisolated struct RecipeStep: Codable, Hashable, Identifiable {
    var id = UUID()
    var text: String
}

@Model
final class Recipe {
    var uuid: UUID = UUID()
    var title: String = ""
    var summary: String?
    var tags: [String] = []
    var servings: Int?
    var totalTimeMinutes: Int?
    var caloriesKcal: Double?
    var proteinGrams: Double?
    var carbsGrams: Double?
    var fatGrams: Double?
    var sourceURL: String?
    var notes: String?
    var favorited: Bool = false
    var lastCookedAt: Date?
    @Attribute(.externalStorage) var photo: Data?
    /// Server path of the photo the local copy came from (e.g. /api/files/…).
    var remotePhotoPath: String?
    var ingredientsJSON: Data?
    var stepsJSON: Data?
    var communityAuthor: String?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var serverID: String?
    var needsPush: Bool = true
    var photoNeedsUpload: Bool = false
    /// The server only toggles favorites, so remember what it last had.
    var syncedFavorited: Bool = false

    init(title: String) {
        self.title = title
    }

    var ingredients: [Ingredient] {
        get { ingredientsJSON.flatMap { try? JSONDecoder().decode([Ingredient].self, from: $0) } ?? [] }
        set { ingredientsJSON = try? JSONEncoder().encode(newValue) }
    }

    var steps: [RecipeStep] {
        get { stepsJSON.flatMap { try? JSONDecoder().decode([RecipeStep].self, from: $0) } ?? [] }
        set { stepsJSON = try? JSONEncoder().encode(newValue) }
    }

    func touch() {
        updatedAt = Date()
        needsPush = true
    }
}

enum ShoppingSource: String, Codable {
    case manual, fromRecipe = "from-recipe", lowStock = "low-stock"
}

@Model
final class ShoppingItem {
    var uuid: UUID = UUID()
    var name: String = ""
    var quantity: Double?
    var unit: String?
    var category: String?
    var checked: Bool = false
    var note: String?
    var sourceRaw: String = ShoppingSource.manual.rawValue
    var recipeUUID: UUID?
    var recipeServerID: String?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var serverID: String?
    var needsPush: Bool = true

    init(name: String, quantity: Double? = nil, unit: String? = nil, source: ShoppingSource = .manual) {
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.sourceRaw = source.rawValue
    }

    var source: ShoppingSource { ShoppingSource(rawValue: sourceRaw) ?? .manual }

    func touch() {
        updatedAt = Date()
        needsPush = true
    }
}

/// A server record deleted on this device, waiting to be removed remotely.
@Model
final class Tombstone {
    var kind: String = ""
    var serverID: String = ""
    var deletedAt: Date = Date()

    init(kind: SyncKind, serverID: String) {
        self.kind = kind.rawValue
        self.serverID = serverID
    }
}

enum SyncKind: String {
    case pantry, recipe, shopping
}

enum KitchenSchema {
    static let models: [any PersistentModel.Type] = [PantryItem.self, Recipe.self, ShoppingItem.self, Tombstone.self]
}
