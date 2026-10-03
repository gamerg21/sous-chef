#if DEBUG
import AppIntents
import Foundation
import SwiftData

/// Resets the kitchen to known contents for the App Intents UI tests. Hidden
/// from Siri and Shortcuts, and left out of release builds.
struct ResetKitchenForTestsIntent: AppIntent {
    static let title: LocalizedStringResource = "Reset Kitchen for Tests"
    static let isDiscoverable = false
    static let supportedModes: IntentModes = .background

    @MainActor
    func perform() async throws -> some IntentResult {
        let kitchen = Kitchen.shared
        guard ProcessInfo.processInfo.arguments.contains("-uiTesting") else { return .result() }
        for item in kitchen.fetch(PantryItem.self) { kitchen.context.delete(item) }
        for recipe in kitchen.fetch(Recipe.self) { kitchen.context.delete(recipe) }
        for item in kitchen.fetch(ShoppingItem.self) { kitchen.context.delete(item) }

        let soon = Calendar.current.date(byAdding: .day, value: 1, to: Date())
        let pantry: [(String, Double, String, StorageLocation, Date?)] = [
            ("Pasta", 500, "g", .pantry, nil), ("Garlic", 6, "each", .pantry, nil),
            ("Spinach", 200, "g", .fridge, soon), ("Whole milk", 1, "l", .fridge, nil),
        ]
        for (name, quantity, unit, location, expires) in pantry {
            let item = PantryItem(name: name, location: location, quantity: quantity, unit: unit)
            item.expiresOn = expires
            kitchen.context.insert(item)
        }
        for (title, ingredients) in [("Spinach Pasta", [("Pasta", 200.0, "g"), ("Spinach", 100.0, "g"), ("Garlic", 2.0, "each")]),
                                     ("Pesto Pasta", [("Pasta", 200.0, "g"), ("Basil", 1.0, "bunch"), ("Pine nuts", 30.0, "g")])] {
            var draft = RecipeDraft(title: title)
            draft.ingredients = ingredients.map { Ingredient(name: $0.0, quantity: $0.1, unit: $0.2) }
            draft.steps = [RecipeStep(text: "Cook and serve.")]
            kitchen.save(draft)
        }
        kitchen.changed()
        await KitchenIndex.refresh(kitchen)
        return .result()
    }
}
#endif
