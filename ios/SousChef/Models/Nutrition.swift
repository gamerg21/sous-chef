import Foundation

/// Nutrition per 100 g, matching the web app's `nutritionPer100g` keys.
nonisolated struct Nutrition: Codable, Hashable {
    var energyKcal: Double?
    var proteinG: Double?
    var carbsG: Double?
    var fatG: Double?
    var sugarsG: Double?
    var fiberG: Double?
    var saltG: Double?

    @MainActor static let fields: [(key: WritableKeyPath<Nutrition, Double?>, label: String, unit: String)] = [
        (\.energyKcal, "Calories", "kcal"),
        (\.proteinG, "Protein", "g"),
        (\.carbsG, "Carbs", "g"),
        (\.fatG, "Fat", "g"),
        (\.sugarsG, "Sugars", "g"),
        (\.fiberG, "Fiber", "g"),
        (\.saltG, "Salt", "g"),
    ]

    var isEmpty: Bool { jsonObject.isEmpty }

    /// Reads either our keys or Open Food Facts `nutriments` keys.
    init(json: [String: Any]) {
        func read(_ key: String, _ off: String) -> Double? {
            let value = json[key] ?? json[off]
            let number = (value as? Double) ?? (value as? Int).map(Double.init) ?? (value as? String).flatMap(Double.init)
            guard let number, number.isFinite, number >= 0 else { return nil }
            return number
        }
        energyKcal = read("energyKcal", "energy-kcal_100g")
        proteinG = read("proteinG", "proteins_100g")
        carbsG = read("carbsG", "carbohydrates_100g")
        fatG = read("fatG", "fat_100g")
        sugarsG = read("sugarsG", "sugars_100g")
        fiberG = read("fiberG", "fiber_100g")
        saltG = read("saltG", "salt_100g")
    }

    init() {}

    var jsonObject: [String: Double] {
        var result: [String: Double] = [:]
        if let energyKcal { result["energyKcal"] = energyKcal }
        if let proteinG { result["proteinG"] = proteinG }
        if let carbsG { result["carbsG"] = carbsG }
        if let fatG { result["fatG"] = fatG }
        if let sugarsG { result["sugarsG"] = sugarsG }
        if let fiberG { result["fiberG"] = fiberG }
        if let saltG { result["saltG"] = saltG }
        return result
    }
}

/// Product facts from a barcode lookup (Open Food Facts).
nonisolated struct FoodFacts: Codable, Hashable {
    var brand: String?
    var categoriesTags: [String]?
    var ingredientsText: String?
    var allergensTags: [String]?
    var nutriscoreGrade: String?
    var novaGroup: Int?
    var ecoscoreGrade: String?
    var imageFrontUrl: String?
    var nutrition: Nutrition?
}

nonisolated struct Nutrients: Hashable {
    var energyKcal = 0.0, proteinG = 0.0, carbsG = 0.0, fatG = 0.0, sugarsG = 0.0, fiberG = 0.0, saltG = 0.0
}

/// Recipe nutrition from pantry facts, ported from `src/lib/nutrition.ts`.
/// Weights convert exactly; volumes assume water density and are flagged
/// approximate; count units can't convert.
struct RecipeNutrition {
    enum MissingReason: String { case notLinked = "Not in pantry", noFacts = "No nutrition facts", noAmount = "No amount", noWeight = "Unit has no weight" }

    var total = Nutrients()
    var perServing = Nutrients()
    var counted: [String] = []
    var missing: [(name: String, reason: MissingReason)] = []
    var approximate = false

    static func grams(_ quantity: Double, unit: String?) -> (grams: Double, approximate: Bool)? {
        let key = (unit ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        let mass: [String: Double] = ["mg": 0.001, "g": 1, "gram": 1, "grams": 1, "kg": 1000, "kilogram": 1000, "kilograms": 1000,
                                      "oz": 28.3495, "ounce": 28.3495, "ounces": 28.3495, "lb": 453.592, "lbs": 453.592, "pound": 453.592, "pounds": 453.592]
        let volume: [String: Double] = ["ml": 1, "milliliter": 1, "milliliters": 1, "l": 1000, "liter": 1000, "liters": 1000,
                                        "tsp": 4.92892, "teaspoon": 4.92892, "teaspoons": 4.92892, "tbsp": 14.7868, "tablespoon": 14.7868, "tablespoons": 14.7868,
                                        "cup": 236.588, "cups": 236.588, "fl oz": 29.5735, "pt": 473.176, "pint": 473.176, "qt": 946.353, "quart": 946.353,
                                        "gal": 3785.41, "gallon": 3785.41]
        if let factor = mass[key] { return (quantity * factor, false) }
        if let factor = volume[key] { return (quantity * factor, true) }
        return nil
    }

    static func compute(ingredients: [Ingredient], pantry: [PantryItem], servings: Int?) -> RecipeNutrition {
        var result = RecipeNutrition()
        for ingredient in ingredients {
            let wanted = normalizeName(ingredient.pantryName)
            let candidates = pantry.filter { normalizeName($0.name) == wanted }
            guard !candidates.isEmpty else { result.missing.append((ingredient.name, .notLinked)); continue }
            guard let facts = candidates.lazy.compactMap(\.effectiveNutrition).first else { result.missing.append((ingredient.name, .noFacts)); continue }
            guard let quantity = ingredient.quantity, quantity > 0 else { result.missing.append((ingredient.name, .noAmount)); continue }
            guard let weight = grams(quantity, unit: ingredient.unit) else { result.missing.append((ingredient.name, .noWeight)); continue }
            let scale = weight.grams / 100
            result.total.energyKcal += (facts.energyKcal ?? 0) * scale
            result.total.proteinG += (facts.proteinG ?? 0) * scale
            result.total.carbsG += (facts.carbsG ?? 0) * scale
            result.total.fatG += (facts.fatG ?? 0) * scale
            result.total.sugarsG += (facts.sugarsG ?? 0) * scale
            result.total.fiberG += (facts.fiberG ?? 0) * scale
            result.total.saltG += (facts.saltG ?? 0) * scale
            result.counted.append(ingredient.name)
            if weight.approximate { result.approximate = true }
        }
        let divisor = Double(max(servings ?? 1, 1))
        result.perServing = Nutrients(
            energyKcal: result.total.energyKcal / divisor, proteinG: result.total.proteinG / divisor,
            carbsG: result.total.carbsG / divisor, fatG: result.total.fatG / divisor,
            sugarsG: result.total.sugarsG / divisor, fiberG: result.total.fiberG / divisor, saltG: result.total.saltG / divisor)
        return result
    }
}

nonisolated func normalizeName(_ value: String?) -> String {
    (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
}
