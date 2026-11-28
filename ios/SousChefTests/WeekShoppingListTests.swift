import Foundation
import SwiftData
import Testing
@testable import SousChef

/// The week's shortages against the shopping list: one row per food, and the
/// plan cards and the button reading the same answer.
@MainActor
struct WeekShoppingListTests {
    private let monday = "2026-09-28"

    private func row(_ name: String, _ quantity: Double? = nil, _ unit: String? = nil, checked: Bool = false, note: String? = nil,
                     age: TimeInterval = 0) -> MealPlanner.ListRow {
        MealPlanner.ListRow(id: UUID(), name: name, quantity: quantity, unit: unit, checked: checked, note: note,
                            createdAt: Date(timeIntervalSince1970: 1_000_000 - age))
    }

    private func recipe(_ kitchen: Kitchen, _ title: String, _ ingredients: [(String, Double?, String?)]) -> Recipe {
        var draft = RecipeDraft(title: title)
        draft.ingredients = ingredients.map { Ingredient(name: $0.0, quantity: $0.1, unit: $0.2) }
        return kitchen.save(draft)
    }

    private func gap(_ kitchen: Kitchen) -> MealPlanner.ListGap {
        MealPlanner.listGap(for: kitchen.weekShortages(from: monday).missingIngredients, on: kitchen.fetch(ShoppingItem.self).map(\.listRow))
    }

    // MARK: The same food

    @Test func singularAndPluralNamesAreOneFood() {
        #expect(FoodWords.key("Carrots") == FoodWords.key(" carrot"))
        #expect(FoodWords.key("Lemons") == FoodWords.key("LEMON"))
        #expect(FoodWords.key("Cherry tomatoes") == FoodWords.key("cherry tomato"))
        #expect(FoodWords.key("Berries") == FoodWords.key("berry"))
        // The rule the pantry refill uses.
        #expect(RefillMatch.sameFood("Carrots", as: "carrot"))
        // Different foods stay apart.
        #expect(FoodWords.key("Oat milk") != FoodWords.key("Milk"))
        #expect(FoodWords.key("Chocolate milk") != FoodWords.key("Milk chocolate"))
        #expect(FoodWords.key("Pasta") != FoodWords.key("Paste"))
        // A name with no letters still matches itself.
        #expect(FoodWords.key(" ??? ") == "???")
    }

    @Test func combinesSingularAndPluralShortages() {
        let combined = MealPlanner.combine([
            .init(name: "Carrot", quantity: 1, unit: nil),
            .init(name: "carrots", quantity: 2, unit: nil),
            .init(name: "Lemons", quantity: nil, unit: nil),
            .init(name: "Lemon", quantity: 1, unit: nil),
        ])
        #expect(combined == [.init(name: "Carrot", quantity: 3, unit: nil), .init(name: "Lemons", quantity: 1, unit: nil)])
    }

    @Test func aRecipesShortagesTopUpItsPluralRow() {
        let kitchen = Kitchen(inMemory: true)
        let soup = recipe(kitchen, "Soup", [("Carrot", 3, nil)])
        let carrots = ShoppingItem(name: "Carrots", quantity: 1, source: .fromRecipe)
        carrots.recipeUUID = soup.uuid
        kitchen.context.insert(carrots)
        #expect(kitchen.addShortages(for: soup) == 1)
        #expect(kitchen.fetch(ShoppingItem.self).count == 1)
        #expect(carrots.quantity == 3)
    }

    // MARK: What the list still lacks

    @Test func findsWhatTheListStillLacks() {
        let needs: [CookingPlan.Missing] = [
            .init(name: "Carrot", quantity: 1, unit: nil),
            .init(name: "Milk", quantity: 1, unit: "l"),
            .init(name: "Flour", quantity: 200, unit: "g"),
            .init(name: "Salt", quantity: nil, unit: nil),
            .init(name: "Eggs", quantity: 6, unit: nil),
        ]
        // Nothing on the list: every shortage is a new row.
        let empty = MealPlanner.listGap(for: needs, on: [])
        #expect(empty.needs == 5 && empty.covered == 0 && empty.remaining == 5)
        #expect(empty.additions.map(\.name) == ["Carrot", "Milk", "Flour", "Salt", "Eggs"])
        #expect(empty.updates.isEmpty)

        let carrots = row("Carrots", 500, "g"), milk = row("milk", 500, "ml", checked: true), flour = row("Flour")
        let salt = row("salt", checked: true), eggs = row("Egg", 12)
        let gap = MealPlanner.listGap(for: needs, on: [carrots, milk, flour, salt, eggs])
        // The salt and eggs are there already. Half the milk is in the cart,
        // the flour has no amount yet, and the carrots are sold by weight.
        #expect(gap.covered == 2 && gap.remaining == 3)
        #expect(gap.additions == [.init(name: "Milk", quantity: 0.5, unit: "l", note: nil)])
        #expect(gap.updates.count == 2)
        #expect(gap.updates.contains(.init(id: carrots.id, quantity: 500, unit: "g", note: "plus 1 for planned meals")))
        #expect(gap.updates.contains(.init(id: flour.id, quantity: 200, unit: "g", note: nil)))

        // With those changes on the list, nothing is left to do.
        let after = [row("Carrots", 500, "g", note: "plus 1 for planned meals"), milk, row("Milk", 0.5, "l"), row("Flour", 200, "g"), salt, eggs]
        let done = MealPlanner.listGap(for: needs, on: after)
        #expect(done.covered == 5 && done.remaining == 0)
        #expect(done.additions.isEmpty && done.updates.isEmpty)
    }

    @Test func aRowHoldsEveryAmountItCantAddToItsOwn() {
        // Grams on the list; a count and a volume needed: still one row.
        let needs: [CookingPlan.Missing] = [.init(name: "Carrot", quantity: 2, unit: nil), .init(name: "carrots", quantity: 1, unit: "cup")]
        let gap = MealPlanner.listGap(for: needs, on: [row("Carrots", 500, "g")])
        #expect(gap.additions.isEmpty)
        #expect(gap.updates.map(\.note) == ["plus 2 and 1 cup for planned meals"])
        #expect(gap.covered == 0)

        // Two shortages of one food that can't be added up share the new row.
        let flour: [CookingPlan.Missing] = [.init(name: "Flour", quantity: 700, unit: "g"), .init(name: "Flour", quantity: 1, unit: "cup")]
        #expect(MealPlanner.listGap(for: flour, on: []).additions == [.init(name: "Flour", quantity: 700, unit: "g", note: "plus 1 cup for planned meals")])

        // A row already in the cart is left alone, so the need gets its own.
        let bought = MealPlanner.listGap(for: [.init(name: "Carrot", quantity: 2, unit: nil)], on: [row("Carrots", 500, "g", checked: true)])
        #expect(bought.additions == [.init(name: "Carrot", quantity: 2, unit: nil, note: nil)])
        #expect(bought.updates.isEmpty)
    }

    @Test func keepsThePersonsNoteBesideThePlans() {
        #expect(MealPlanner.planNote(["1"], after: nil) == "plus 1 for planned meals")
        #expect(MealPlanner.planNote(["1"], after: "the small ones") == "the small ones; plus 1 for planned meals")
        // A changed need replaces the earlier one.
        #expect(MealPlanner.planNote(["2", "1 cup"], after: "the small ones; plus 1 for planned meals") == "the small ones; plus 2 and 1 cup for planned meals")
        #expect(MealPlanner.withoutPlanNote("Plus 1 for planned meals") == nil)
        #expect(MealPlanner.withoutPlanNote("plus the green tops") == "plus the green tops")
    }

    @Test func topsUpTheOldestRowWhateverOrderTheListComesIn() {
        let old = row("Milk", 1, "l", age: 100), new = row("Milk", 1, "l")
        let need: [CookingPlan.Missing] = [.init(name: "Milk", quantity: 3, unit: "l")]
        #expect(MealPlanner.listGap(for: need, on: [new, old]).updates == [.init(id: old.id, quantity: 2, unit: "l", note: nil)])
        #expect(MealPlanner.listGap(for: need, on: [old, new]) == MealPlanner.listGap(for: need, on: [new, old]))
    }

    // MARK: Adding the week's shortages

    @Test func addsToTheRowsOnTheListInsteadOfBesideThem() {
        let kitchen = Kitchen(inMemory: true)
        let roast = recipe(kitchen, "Roast", [("Carrot", 1, nil), ("Lemon", 1, nil), ("Onion", 2, nil)])
        kitchen.plan(roast, on: monday)
        kitchen.addShopping("Carrots", quantity: 500, unit: "g")
        kitchen.addShopping("Lemons")
        kitchen.addShopping("onions", quantity: 1)

        // What the cards show is what the button then does.
        let before = gap(kitchen)
        #expect(before.needs == 3 && before.covered == 0)
        let first = kitchen.addWeekShortages(from: monday)
        #expect(first.added == 0 && first.updated == 3)
        #expect(first.added == before.additions.count && first.updated == before.updates.count)
        #expect(gap(kitchen).remaining == 0)

        let items = kitchen.fetch(ShoppingItem.self)
        #expect(items.count == 3)
        let carrots = items.first { $0.name == "Carrots" }
        let lemons = items.first { $0.name == "Lemons" }
        let onions = items.first { $0.name == "onions" }
        // 500 g can't be compared with one carrot: the row stays and says so.
        #expect(carrots?.quantity == 500 && carrots?.unit == "g")
        #expect(carrots?.note == "plus 1 for planned meals")
        #expect(lemons?.quantity == 1)
        #expect(onions?.quantity == 2)

        // Again changes nothing.
        let again = kitchen.addWeekShortages(from: monday)
        #expect(again.added == 0 && again.updated == 0)
        #expect(kitchen.fetch(ShoppingItem.self).count == 3)
        #expect(carrots?.note == "plus 1 for planned meals")

        // A second roast doubles the need: the note is replaced, not added to.
        kitchen.plan(roast, on: "2026-09-29")
        #expect(gap(kitchen).covered == 0)
        let more = kitchen.addWeekShortages(from: monday)
        #expect(more.added == 0 && more.updated == 3)
        #expect(kitchen.fetch(ShoppingItem.self).count == 3)
        #expect(carrots?.note == "plus 2 for planned meals")
        #expect(lemons?.quantity == 2)
        #expect(onions?.quantity == 4)
        #expect(gap(kitchen).remaining == 0)
    }

    // MARK: The toast

    @Test func wordsTheToast() {
        #expect(MealPlanner.listToast(added: 5, updated: 0) == "Added 5 items to your list")
        #expect(MealPlanner.listToast(added: 1, updated: 0) == "Added 1 item to your list")
        #expect(MealPlanner.listToast(added: 0, updated: 2) == "Topped up 2 items on your list")
        #expect(MealPlanner.listToast(added: 0, updated: 1) == "Topped up 1 item on your list")
        #expect(MealPlanner.listToast(added: 3, updated: 2) == "Added 3 and topped up 2 on your list")
        #expect(MealPlanner.listToast(added: 1, updated: 1) == "Added 1 and topped up 1 on your list")
        #expect(MealPlanner.listToast(added: 0, updated: 0) == "Your list already covers this week")
    }
}
