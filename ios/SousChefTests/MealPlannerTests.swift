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

    @Test func readsOnlyItsOwnDragPayloads() {
        let id = UUID()
        #expect(PlanDrag(payload: PlanDrag.recipe(id).payload) == .recipe(id))
        #expect(PlanDrag(payload: PlanDrag.meal(id).payload + "\n") == .meal(id))
        #expect(PlanDrag(payload: id.uuidString) == nil)
        #expect(PlanDrag(payload: "souschef-recipe:not-a-uuid") == nil)
        #expect(PlanDrag(payload: "Two eggs and some toast") == nil)
    }

    @Test func plansDroppedRecipesAndMovesDroppedMeals() {
        let kitchen = Kitchen(inMemory: true)
        let curry = recipe(kitchen, "Curry", servings: 4, [("Rice", 200, "g")])
        let planned = kitchen.drop(.recipe(curry.uuid), on: "2026-10-21", slot: .lunch)
        #expect(planned?.recipeUUID == curry.uuid)
        #expect(planned?.slot == .lunch)
        #expect(planned?.servings == 4)

        let meal = try! #require(planned)
        #expect(kitchen.drop(.meal(meal.uuid), on: "2026-10-21", slot: .lunch) == nil)
        #expect(kitchen.drop(.meal(meal.uuid), on: "2026-10-23", slot: .dinner) === meal)
        #expect(meal.day == "2026-10-23")
        #expect(meal.slot == .dinner)
        #expect(kitchen.plannedMeals(from: "2026-10-18").count == 1)

        #expect(kitchen.drop(.recipe(UUID()), on: "2026-10-21", slot: .dinner) == nil)
        #expect(kitchen.drop(.meal(UUID()), on: "2026-10-21", slot: .dinner) == nil)
    }

    @Test func ranksPopularAndNewRecipesForTheGlancePane() {
        let now = MealPlanner.date("2026-10-21") // noon
        let day: (Int) -> Date = { Calendar.current.date(byAdding: .day, value: $0, to: now)! }
        let curry = UUID(), roast = UUID(), salad = UUID(), old = UUID()
        let entries = [
            RecipeStats.Entry(id: curry, createdAt: day(-90), lastCookedAt: day(-2), minutes: 30, tags: ["dinner"], missing: 0, usesExpiring: true),
            RecipeStats.Entry(id: roast, createdAt: day(-10), lastCookedAt: day(-1), minutes: 90, tags: ["dinner"], missing: 1, usesExpiring: false),
            RecipeStats.Entry(id: salad, createdAt: day(-3), lastCookedAt: nil, minutes: 10, tags: ["lunch", "dinner"], missing: 3, usesExpiring: false),
            RecipeStats.Entry(id: old, createdAt: day(-200), lastCookedAt: day(-100), minutes: nil, tags: [], missing: nil, usesExpiring: false),
        ]
        let meals: [(recipe: UUID, day: String)] = [
            (roast, "2026-10-20"), (roast, "2026-10-23"), (salad, "2026-10-22"),
            (curry, "2026-09-01"), // before the month
            (salad, "2026-11-05"), // beyond the week ahead
        ]
        let month = RecipeStats.compute(entries, meals: meals, period: .month, now: now)
        // Roast: two meals (one the day it was cooked, so not counted again);
        // curry: cooked unplanned; salad: one meal this week.
        #expect(month.popular.map(\.id) == [roast, salad, curry])
        #expect(month.popular.map(\.count) == [2, 1, 1])
        #expect(month.recent == [salad, roast])
        #expect(month.ready == [curry])
        #expect(month.almost == [roast])
        #expect(month.quick == [salad])
        #expect(month.expiring == [curry])
        #expect(month.tags.map(\.tag) == ["dinner", "lunch"])

        let week = RecipeStats.compute(entries, meals: meals, period: .week, now: now)
        #expect(Set(week.popular.map(\.id)) == [roast, salad, curry])
        #expect(!week.popular.contains { $0.id == old })
    }
}
