import Foundation
import Testing
@testable import SousChef

/// Week shortages and the plan's shopping merge, matching the server's rules.
@MainActor
struct MealPlannerTests {
    private func recipe(_ kitchen: Kitchen, _ title: String, servings: Int?, _ ingredients: [(String, Double, String)]) -> Recipe {
        var draft = RecipeDraft(title: title)
        draft.servings = servings
        draft.ingredients = ingredients.map { Ingredient(name: $0.0, quantity: $0.1, unit: $0.2) }
        return kitchen.save(draft)
    }

    @Test func combinesTheSameFoodAcrossUnits() {
        let combined = MealPlanner.combine([
            .init(name: "Milk", quantity: 250, unit: "ml"),
            .init(name: "milk ", quantity: 1, unit: "l"),
            .init(name: "Flour", quantity: 200, unit: "g"),
            .init(name: "Flour", quantity: 1, unit: "cup"),
            .init(name: "Flour", quantity: 0.5, unit: "kg"),
            .init(name: "Salt", quantity: nil, unit: nil),
            .init(name: "Salt", quantity: 5, unit: "g"),
        ])
        #expect(combined == [
            .init(name: "Milk", quantity: 1250, unit: "ml"),
            .init(name: "Flour", quantity: 700, unit: "g"),
            .init(name: "Flour", quantity: 1, unit: "cup"),
            .init(name: "Salt", quantity: 5, unit: "g"),
        ])
    }

    @Test func countsThePantryOnceForTheWeek() {
        // 1 l in stock; two meals need 600 ml each: 0.2 l short in all, not per meal.
        let shortages = MealPlanner.shortages(
            for: [[Ingredient(name: "Milk", quantity: 600, unit: "ml")], [Ingredient(name: "Milk", quantity: 0.6, unit: "l")]],
            stock: [StockLine(id: UUID(), name: "Milk", quantity: 1, unit: "l")])
        #expect(shortages.missingIngredients == [.init(name: "Milk", quantity: 0.2, unit: "l")])
        #expect(shortages.meals == 2)
    }

    @Test func addsWeekShortagesOnceAndMergesWithTheList() {
        let kitchen = Kitchen(inMemory: true)
        kitchen.context.insert(PantryItem(name: "Milk", quantity: 1, unit: "l"))
        let pancakes = recipe(kitchen, "Pancakes", servings: 2, [("Milk", 600, "ml"), ("Flour", 200, "g")])
        let porridge = recipe(kitchen, "Porridge", servings: 1, [("Milk", 0.3, "l")])
        let monday = "2026-09-28"
        kitchen.plan(pancakes, on: monday, slot: .breakfast)
        kitchen.plan(porridge, on: "2026-09-29", servings: 2)
        kitchen.setCooked(kitchen.plan(porridge, on: "2026-09-30"), true)
        kitchen.plan(pancakes, on: "2026-10-05")
        // Already on the list: 100 ml of milk in the cart, and flour without an amount.
        kitchen.addShopping("Milk", quantity: 100, unit: "ml")
        kitchen.addShopping("flour")
        kitchen.fetch(ShoppingItem.self).first { $0.name == "Milk" }?.checked = true

        #expect(kitchen.weekShortages(from: monday).missingIngredients == [
            .init(name: "Flour", quantity: 200, unit: "g"),
            .init(name: "Milk", quantity: 0.2, unit: "l"),
        ])
        let first = kitchen.addWeekShortages(from: monday)
        #expect(first.added == 1 && first.updated == 1)
        let items = kitchen.fetch(ShoppingItem.self)
        #expect(items.count == 3)
        let flour = items.first { $0.name == "flour" }
        #expect(flour?.quantity == 200 && flour?.unit == "g")
        let milk = items.first { $0.name == "Milk" && !$0.checked }
        #expect(milk?.quantity == 0.1 && milk?.unit == "l" && milk?.source == .mealPlan)

        let again = kitchen.addWeekShortages(from: monday)
        #expect(again.added == 0 && again.updated == 0)
        #expect(kitchen.fetch(ShoppingItem.self).count == 3)
    }

    @Test func picksTonightsMeal() throws {
        let kitchen = Kitchen(inMemory: true)
        let soup = recipe(kitchen, "Soup", servings: 2, [("Stock", 1, "l")])
        let evening = try #require(Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: .now))
        let today = MealPlanner.day(evening)
        #expect(kitchen.tonightsMeal(now: evening) == nil)
        let lunch = kitchen.plan(soup, on: today, slot: .lunch)
        #expect(kitchen.tonightsMeal(now: evening) === lunch)
        let dinner = kitchen.plan(soup, on: today, slot: .dinner, servings: 4)
        #expect(kitchen.tonightsMeal(now: evening) === dinner)
        #expect(kitchen.scale(for: dinner) == 2)
        kitchen.setCooked(dinner, true)
        #expect(kitchen.tonightsMeal(now: evening) === lunch)
    }

    @Test func cookingAPlannedMealScalesItAndMarksItCooked() async {
        let kitchen = Kitchen(inMemory: true)
        let milk = PantryItem(name: "Milk", quantity: 1, unit: "l")
        kitchen.context.insert(milk)
        let porridge = recipe(kitchen, "Porridge", servings: 1, [("Milk", 250, "ml")])
        let meal = kitchen.plan(porridge, on: MealPlanner.day(.now), servings: 2)
        _ = await kitchen.cook(porridge, addMissing: false, meal: meal)
        #expect(abs(milk.quantity - 0.5) < 0.000001)
        #expect(meal.isCooked)
    }
}
