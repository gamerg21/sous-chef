import Foundation

/// Wire shapes returned by the server's kitchen operations.
enum DTO {
    struct Household: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let role: String
        let isCurrent: Bool
    }

    struct InventoryList: Decodable { let items: [InventoryItem] }

    struct InventoryItem: Decodable {
        let id: String
        let name: String
        let locationId: String
        let quantity: Double
        let unit: String
        let expiresOn: String?
        let category: String?
        let notes: String?
        let photoUrl: String?
        let barcode: String?
        let foodFacts: JSONValue?
        let nutritionPer100g: JSONValue?
    }

    struct RecipeList: Decodable { let recipes: [Recipe] }

    struct Recipe: Decodable {
        struct Ingredient: Decodable {
            struct Mapping: Decodable { let inventoryItemLabel: String }
            let name: String
            let quantity: Double?
            let unit: String?
            let note: String?
            let mapping: Mapping?
        }
        struct Step: Decodable { let text: String }

        let id: String
        let title: String
        let description: String?
        let photoUrl: String?
        let tags: [String]?
        let servings: Double?
        let totalTimeMinutes: Double?
        let caloriesKcal: Double?
        let proteinGrams: Double?
        let carbsGrams: Double?
        let fatGrams: Double?
        let sourceUrl: String?
        let notes: String?
        let ingredients: [Ingredient]
        let steps: [Step]
        let lastCookedAt: String?
        let favorited: Bool
    }

    struct ShoppingList: Decodable { let items: [ShoppingItem] }

    struct ShoppingItem: Decodable {
        let id: String
        let name: String
        let quantity: Double?
        let unit: String?
        let category: String?
        let checked: Bool
        let note: String?
        let source: String?
        let recipeId: String?
    }

    struct Created: Decodable { let id: String }

    struct AIDraft: Decodable {
        struct Draft: Decodable {
            struct Item: Decodable { let name: String; let quantity: Double; let unit: String }
            struct Step: Decodable { let text: String }
            let title: String
            let description: String?
            let servings: Double
            let totalTimeMinutes: Double
            let ingredients: [Item]
            let steps: [Step]
        }
        let draft: Draft
        let provider: String
        let model: String
    }

    struct CommunityList: Decodable {
        let recipes: [CommunityRecipe]
        let available: Bool?
    }

    struct CommunityRecipe: Decodable, Identifiable, Hashable {
        struct Author: Decodable, Hashable { let id: String?; let name: String }
        struct Ingredient: Decodable, Hashable { let name: String; let quantity: Double?; let unit: String?; let note: String? }
        struct Step: Decodable, Hashable { let text: String }
        let id: String
        let title: String
        let description: String?
        let tags: [String]?
        let servings: Double?
        let totalTimeMinutes: Double?
        let sourceUrl: String?
        let photoUrl: String?
        let photoDataUrl: String?
        let ingredients: [Ingredient]
        let steps: [Step]
        let author: Author?
        let createdAt: String?
    }

    struct CommunityPublication: Decodable {
        struct Snapshot: Decodable {
            let title: String
            let description: String?
            let tags: [String]?
            let servings: Double?
            let totalTimeMinutes: Double?
            let sourceUrl: String?
            let photoDataUrl: String?
            let ingredients: [CommunityRecipe.Ingredient]
            let steps: [CommunityRecipe.Step]
        }
        let id: String
        let author: CommunityRecipe.Author
        let createdAt: String?
        let snapshot: Snapshot

        var recipe: CommunityRecipe {
            CommunityRecipe(id: id, title: snapshot.title, description: snapshot.description, tags: snapshot.tags, servings: snapshot.servings,
                            totalTimeMinutes: snapshot.totalTimeMinutes, sourceUrl: snapshot.sourceUrl, photoUrl: nil, photoDataUrl: snapshot.photoDataUrl,
                            ingredients: snapshot.ingredients, steps: snapshot.steps, author: author, createdAt: createdAt)
        }
    }
}

/// Loosely typed JSON for fields such as Open Food Facts nutriments.
enum JSONValue: Decodable, Hashable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    var any: Any {
        switch self {
        case .string(let value): value
        case .number(let value): value
        case .bool(let value): value
        case .object(let value): value.mapValues(\.any)
        case .array(let value): value.map(\.any)
        case .null: NSNull()
        }
    }

    subscript(key: String) -> JSONValue? {
        if case .object(let object) = self { return object[key] }
        return nil
    }

    var stringValue: String? { if case .string(let value) = self { value } else { nil } }
    var doubleValue: Double? { if case .number(let value) = self { value } else { nil } }
    var stringArray: [String]? {
        if case .array(let values) = self { return values.compactMap(\.stringValue) }
        return nil
    }
}

extension FoodFacts {
    init(json: JSONValue) {
        self.init(brand: json["brand"]?.stringValue, categoriesTags: json["categoriesTags"]?.stringArray,
                  ingredientsText: json["ingredientsText"]?.stringValue, allergensTags: json["allergensTags"]?.stringArray,
                  nutriscoreGrade: json["nutriscoreGrade"]?.stringValue, novaGroup: json["novaGroup"]?.doubleValue.map { Int($0) },
                  ecoscoreGrade: json["ecoscoreGrade"]?.stringValue, imageFrontUrl: json["imageFrontUrl"]?.stringValue,
                  nutrition: (json["nutritionPer100g"]?.any as? [String: Any]).map(Nutrition.init(json:)).flatMap { $0.isEmpty ? nil : $0 })
    }
}

enum DayFormat {
    static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func string(_ date: Date?) -> String? {
        guard let date else { return nil }
        // Expiry dates are calendar days; keep the person's local day.
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    static func date(_ string: String?) -> Date? {
        guard let string, string.count >= 10 else { return nil }
        let parts = string.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }
}
