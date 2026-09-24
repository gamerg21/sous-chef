import Foundation
import Testing
@testable import SousChef

/// The decisions behind the Siri and Shortcuts intents.
@MainActor
struct KitchenAssistantTests {
    private func item(_ kitchen: Kitchen, _ name: String, _ quantity: Double = 1, _ unit: String = "each",
                      location: StorageLocation = .pantry, expiresInDays: Int? = nil) -> PantryItem {
        let item = PantryItem(name: name, location: location, quantity: quantity, unit: unit)
        item.expiresOn = expiresInDays.map { Calendar.current.date(byAdding: .day, value: $0, to: Date())! }
        kitchen.context.insert(item)
        return item
    }

    private func recipe(_ kitchen: Kitchen, _ title: String, _ ingredients: [(String, Double, String)], favorite: Bool = false) -> Recipe {
        var draft = RecipeDraft(title: title)
        draft.ingredients = ingredients.map { Ingredient(name: $0.0, quantity: $0.1, unit: $0.2) }
        let recipe = kitchen.save(draft)
        recipe.favorited = favorite
        return recipe
    }

    @Test func listsOnHandFoodSoonestToExpireFirst() {
        let kitchen = Kitchen(inMemory: true)
        _ = item(kitchen, "Rice", 1, "kg")
        _ = item(kitchen, "Milk", 1, "l", location: .fridge, expiresInDays: 2)
        _ = item(kitchen, "Yogurt", 1, "each", location: .fridge, expiresInDays: 1)
        _ = item(kitchen, "Flour", 0, "kg")
        #expect(kitchen.onHand().map(\.name) == ["Yogurt", "Milk", "Rice"])
        #expect(kitchen.onHand(in: .fridge).map(\.name) == ["Yogurt", "Milk"])
        #expect(kitchen.onHand(in: .freezer).isEmpty)
        #expect(kitchen.expiringSoon(within: 1).map(\.name) == ["Yogurt"])
        #expect(kitchen.expiringSoon(within: 3).map(\.name) == ["Yogurt", "Milk"])
    }

    @Test func suggestsReadyRecipesAndPrefersUsingUpExpiringFood() {
        let kitchen = Kitchen(inMemory: true)
        _ = item(kitchen, "Pasta", 500, "g")
        _ = item(kitchen, "Spinach", 200, "g", expiresInDays: 1)
        _ = item(kitchen, "Garlic", 5)
        _ = recipe(kitchen, "Garlic pasta", [("Pasta", 200, "g"), ("Garlic", 2, "each")], favorite: true)
        _ = recipe(kitchen, "Spinach pasta", [("Pasta", 200, "g"), ("Spinach", 100, "g")])
        _ = recipe(kitchen, "Pesto pasta", [("Pasta", 200, "g"), ("Basil", 1, "bunch")])
        _ = recipe(kitchen, "Steak", [("Steak", 1, "each")])

        let suggestions = kitchen.suggestRecipes()
        #expect(suggestions.map(\.recipe.title) == ["Spinach pasta", "Garlic pasta", "Pesto pasta"])
        #expect(suggestions[0].usesExpiring == 1)
        #expect(suggestions[2].plan.missingIngredients.map(\.name) == ["Basil"])
        #expect(SuggestRecipeIntent.sentence(for: suggestions[0]) == "You can make Spinach pasta with what you have. It uses up food that expires soon.")
        #expect(SuggestRecipeIntent.sentence(for: suggestions[2]) == "Pesto pasta is closest. You're missing Basil.")
    }

    @Test func addsSpokenItemsWithoutDuplicatingTheList() {
        let kitchen = Kitchen(inMemory: true)
        let first = kitchen.addToShoppingList(Kitchen.splitSpokenList("milk, eggs and 2 loaves of bread"))
        #expect(first.map(\.name) == ["milk", "eggs", "loaves of bread"])
        #expect(first.last?.quantity == 2)
        #expect(first.first?.category == "Dairy")

        let second = kitchen.addToShoppingList(["Milk", "butter"])
        #expect(second.map(\.name) == ["butter"])
        #expect(kitchen.openShoppingItems().count == 4)
    }

    @Test func splitsSpokenListsButKeepsCompoundFoods() {
        #expect(Kitchen.splitSpokenList("milk, eggs and bread") == ["milk", "eggs", "bread"])
        #expect(Kitchen.splitSpokenList("mac and cheese and salt and pepper") == ["mac and cheese", "salt and pepper"])
        #expect(Kitchen.splitSpokenList("Half and half.") == ["Half and half"])
        #expect(Kitchen.splitSpokenList("  ") == [])
    }

    @Test func matchesNamesWithoutTouchingOtherFoods() {
        let names = ["Whole milk", "Butter", "Peanut butter"]
        #expect(Kitchen.bestMatches(for: "milk", in: names, name: { $0 }) == ["Whole milk"])
        #expect(Kitchen.bestMatches(for: "butter", in: names, name: { $0 }) == ["Butter"])
        #expect(Kitchen.bestMatches(for: "peanut", in: names, name: { $0 }) == ["Peanut butter"])
        #expect(Kitchen.bestMatches(for: "oat milk", in: ["Oat milk", "Whole milk"], name: { $0 }) == ["Oat milk"])
        // Ambiguous: two different foods match, so nothing is chosen.
        #expect(Kitchen.bestMatches(for: "milk", in: ["Oat milk", "Whole milk"], name: { $0 }).isEmpty)
    }

    @Test func runningOutEmptiesThePantryAndAddsToTheList() {
        let kitchen = Kitchen(inMemory: true)
        let milk = item(kitchen, "Whole milk", 1, "l", location: .fridge)
        let peanutButter = item(kitchen, "Peanut butter", 1, "each")

        let result = kitchen.ranOut(of: "whole milk")
        #expect(result.emptied.map(\.name) == ["Whole milk"])
        #expect(result.addedToList)
        #expect(milk.quantity == 0)
        #expect(kitchen.fetch(PantryItem.self).count == 2, "Emptied batches stay as placeholders")
        #expect(kitchen.openShoppingItems().map(\.name) == ["Whole milk"])
        #expect(kitchen.ranOut(of: "Whole milk").addedToList == false)

        // Only exact names are emptied; close matches are confirmed by the intent first.
        let butter = kitchen.ranOut(of: "butter")
        #expect(butter.emptied.isEmpty)
        #expect(peanutButter.quantity == 1)
        #expect(kitchen.openShoppingItems().map(\.name) == ["Whole milk", "butter"])
    }

    @Test func checksOffTheMatchingListItem() {
        let kitchen = Kitchen(inMemory: true)
        kitchen.addToShoppingList(["Eggs", "Oat milk"])
        #expect(kitchen.checkOff("milk").map(\.name) == ["Oat milk"])
        #expect(kitchen.checkOff("bread").isEmpty)
        #expect(kitchen.openShoppingItems().map(\.name) == ["Eggs"])
    }

    @Test func speaksShortLists() {
        #expect(Kitchen.spokenList(["milk"]) == "milk")
        #expect(Kitchen.spokenList(["milk", "eggs", "bread"]) == "milk, eggs, and bread")
        #expect(Kitchen.spokenList(["a", "b", "c", "d"], limit: 2) == "a, b, and 2 more")
    }

    @Test func recipeEntitiesShareAsPlainText() {
        let kitchen = Kitchen(inMemory: true)
        var draft = RecipeDraft(title: "Toast")
        draft.summary = "Crisp."
        draft.ingredients = [Ingredient(name: "Bread", quantity: 2, unit: "slice")]
        draft.steps = [RecipeStep(text: "Toast the bread.")]
        let entity = RecipeEntity(kitchen.save(draft))
        #expect(entity.plainText == "Toast\n\nCrisp.\n\nIngredients\n• 2 slice Bread\n\nSteps\n1. Toast the bread.")
    }
}
