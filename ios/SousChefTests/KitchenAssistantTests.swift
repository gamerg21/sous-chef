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
        #expect(suggestions[0].usesExpiring == ["Spinach"])
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

    @Test func cookTabRanksEveryRecipeTheSameWayAsSiri() {
        let kitchen = Kitchen(inMemory: true)
        _ = item(kitchen, "Pasta", 500, "g")
        _ = recipe(kitchen, "Pasta", [("Pasta", 200, "g")])
        _ = recipe(kitchen, "Steak", [("Steak", 1, "each")])
        _ = recipe(kitchen, "Empty", [])
        let ranked = Kitchen.rankRecipes(kitchen.fetch(Recipe.self), pantry: kitchen.fetch(PantryItem.self))
        // The Cook tab keeps recipes that need a shop; Siri only suggests ones the pantry helps with.
        #expect(ranked.map(\.recipe.title) == ["Pasta", "Steak"])
        #expect(kitchen.suggestRecipes().map(\.recipe.title) == ["Pasta"])
    }

    @Test func readinessKeyChangesWhenIngredientsOrStockChange() {
        let kitchen = Kitchen(inMemory: true)
        let pasta = item(kitchen, "Pasta", 500, "g")
        let dish = recipe(kitchen, "Pasta", [("Pasta", 200, "g")])
        let key = { Kitchen.readinessKey(recipes: kitchen.fetch(Recipe.self), pantry: kitchen.fetch(PantryItem.self)) }
        let original = key()
        #expect(key() == original)

        // Server sync replaces ingredients without touching updatedAt.
        dish.ingredients = [Ingredient(name: "Pasta", quantity: 300, unit: "g")]
        let edited = key()
        #expect(edited != original)

        pasta.quantity = 100
        #expect(key() != edited)
    }

    @Test func memoRecomputesOnlyWhenTheKeyChanges() {
        let memo = Memo<Int, Int>()
        var runs = 0
        #expect(memo(1) { runs += 1; return 10 } == 10)
        #expect(memo(1) { runs += 1; return 20 } == 10)
        #expect(memo(2) { runs += 1; return 30 } == 30)
        #expect(runs == 2)
    }

    @Test func editorFieldsTreatBlankAsUnset() {
        var draft = RecipeDraft(title: "Soup")
        draft.servingsCount = 4
        draft.totalMinutes = 0
        draft.notesText = "Freezes well"
        #expect(draft.servings == 4)
        #expect(draft.totalTimeMinutes == nil)
        #expect(draft.notes == "Freezes well")
        draft.servingsCount = 0
        #expect(draft.servings == nil)

        var ingredient = Ingredient(name: "Onion")
        ingredient.noteText = "finely chopped"
        ingredient.unitText = ""
        #expect(ingredient.note == "finely chopped")
        #expect(ingredient.unit == nil)
        ingredient.mappingText = "Yellow onion"
        #expect(ingredient.pantryName == "Yellow onion")
    }

    @Test func findsALinkOnlyWhenTheTextIsJustALink() {
        let link = "https://www.allrecipes.com/recipe/284447/million-dollar-soup/"
        #expect(Kitchen.recipeLink(in: link)?.absoluteString == link)
        #expect(Kitchen.recipeLink(in: "Million Dollar Soup\n\(link)")?.absoluteString == link)
        #expect(Kitchen.recipeLink(in: "Soup\nIngredients\n2 potatoes\nSteps\nSimmer.\nFrom \(link)") == nil)
        #expect(Kitchen.recipeLink(in: "\(link) and https://example.com/other") == nil)
        #expect(Kitchen.recipeLink(in: "2 cups flour") == nil)
    }

    @Test func recognizesARecipeAlreadyImportedFromThePage() {
        let kitchen = Kitchen(inMemory: true)
        var draft = RecipeDraft(title: "Million Dollar Soup")
        draft.ingredients = [Ingredient(name: "Potatoes", quantity: 2, unit: "each")]
        draft.sourceURL = "https://www.allrecipes.com/recipe/284447/million-dollar-soup/"
        let saved = kitchen.save(draft)

        let shared = URL(string: "https://allrecipes.com/recipe/284447/million-dollar-soup?utm_source=share")!
        #expect(kitchen.recipe(importedFrom: shared)?.uuid == saved.uuid)
        #expect(kitchen.recipe(importedFrom: URL(string: "https://allrecipes.com/recipe/1/other-soup/")!) == nil)
        #expect(Kitchen.pageKey(URL(string: "https://example.com/recipe?id=4")!) != Kitchen.pageKey(URL(string: "https://example.com/recipe?id=5")!))
    }

    @Test func savesImportsOnlyWhenIngredientsWereFound() {
        #expect(Kitchen.readyToSave(RecipeDraft(title: "Nothing here")) == nil)
        var draft = RecipeDraft()
        draft.ingredients = [Ingredient(name: "Rice", quantity: 1, unit: "cup")]
        #expect(Kitchen.readyToSave(draft)?.title == "Untitled Recipe")
        draft.title = "Rice"
        #expect(Kitchen.readyToSave(draft)?.title == "Rice")
    }

    @Test func sharesImportTheLinkOrTheRecipeText() {
        let page = URL(string: "https://www.bbcgoodfood.com/recipes/easy-pancakes")!
        #expect(SharedRecipeInbox.item(url: page, text: "Easy pancakes") == .link(page))
        #expect(SharedRecipeInbox.item(url: nil, text: "Easy pancakes \(page.absoluteString)") == .link(page))
        let recipe = "Pancakes\nIngredients\n100 g flour\n2 eggs\nSteps\nWhisk and fry."
        #expect(SharedRecipeInbox.item(url: nil, text: recipe) == .text(recipe))
        #expect(SharedRecipeInbox.item(url: URL(fileURLWithPath: "/tmp/a.txt"), text: nil) == nil)
        #expect(SharedRecipeInbox.item(url: nil, text: "  ") == nil)
    }
}
