import Foundation
import SwiftData

/// Planning meals for the week. Readiness, shortages and cooking reuse the
/// cooking planner, so a planned meal behaves exactly like cooking its recipe.
extension Kitchen {
    // MARK: Planning

    @discardableResult
    func plan(_ recipe: Recipe, on day: String, slot: MealSlot = .dinner, servings: Int? = nil, note: String? = nil) -> PlannedMeal {
        let meal = PlannedMeal(recipe: recipe, day: day, slot: slot, servings: servings)
        meal.note = note?.nilIfEmpty
        context.insert(meal)
        changed()
        return meal
    }

    /// Plans a recipe dropped on the planner, or moves a planned meal there.
    /// Returns the meal, or nil when the item is gone or a meal didn't move.
    @discardableResult
    func drop(_ drag: PlanDrag, on day: String, slot: MealSlot) -> PlannedMeal? {
        switch drag {
        case .recipe(let id):
            guard let recipe = try? context.fetch(FetchDescriptor<Recipe>(predicate: #Predicate { $0.uuid == id })).first else { return nil }
            return plan(recipe, on: day, slot: slot)
        case .meal(let id):
            guard let meal = try? context.fetch(FetchDescriptor<PlannedMeal>(predicate: #Predicate { $0.uuid == id })).first,
                  meal.day != day || meal.slot != slot else { return nil }
            meal.day = day
            meal.slot = slot
            meal.touch()
            changed()
            return meal
        }
    }

    func delete(_ meal: PlannedMeal, undoable: Bool = false) {
        if undoable { registerUndoDelete([meal], name: "the planned meal") }
        if let id = meal.serverID { context.insert(Tombstone(kind: .mealPlan, serverID: id)) }
        context.delete(meal)
    }

    /// Marks a meal cooked (or not) without touching the pantry, e.g. eaten out.
    func setCooked(_ meal: PlannedMeal, _ cooked: Bool) {
        meal.cookedAt = cooked ? meal.cookedAt ?? Date() : nil
        meal.touch()
        changed()
    }

    func markCooked(_ meal: PlannedMeal?) {
        guard let meal, meal.cookedAt == nil else { return }
        meal.cookedAt = Date()
        meal.touch()
    }

    // MARK: Reading

    func recipe(for meal: PlannedMeal) -> Recipe? {
        guard let id = meal.recipeUUID else { return nil }
        return try? context.fetch(FetchDescriptor<Recipe>(predicate: #Predicate { $0.uuid == id })).first
    }

    func scale(for meal: PlannedMeal) -> Double {
        MealPlanner.scale(servings: meal.servings, recipeServings: recipe(for: meal)?.servings)
    }

    /// Meals planned from `start` for `days` days, in day and meal order.
    func plannedMeals(from start: String, days: Int = 7) -> [PlannedMeal] {
        let end = MealPlanner.day(start, adding: days)
        let descriptor = FetchDescriptor<PlannedMeal>(predicate: #Predicate { $0.day >= start && $0.day < end })
        return ((try? context.fetch(descriptor)) ?? [])
            .sorted { ($0.day, $0.slot.order, $0.createdAt) < ($1.day, $1.slot.order, $1.createdAt) }
    }

    /// The meal to cook tonight, for the Cook screen and widgets. See `MealPlanner.tonight`.
    func tonightsMeal(now: Date = .now) -> PlannedMeal? {
        MealPlanner.tonight(in: plannedMeals(from: MealPlanner.day(now), days: 1), now: now)
    }

    // MARK: Shopping

    /// What the week's uncooked meals need beyond the pantry, counted once.
    func weekShortages(from start: String, days: Int = 7) -> MealPlanner.Shortages {
        let recipes = plannedMeals(from: start, days: days).filter { !$0.isCooked }.compactMap { meal -> [Ingredient]? in
            guard let recipe = recipe(for: meal) else { return nil }
            return MealPlanner.scaled(recipe.ingredients, by: MealPlanner.scale(servings: meal.servings, recipeServings: recipe.servings))
        }
        return MealPlanner.shortages(for: recipes, stock: stock())
    }

    /// Adds the week's shortages to the list, one row per food, so doing it
    /// twice changes nothing (`MealPlanner.listGap` has the rules). The
    /// server's merge is stricter about names: it keeps "Carrot" and
    /// "Carrots" apart, and adds a second row where units can't be compared.
    @discardableResult
    func addWeekShortages(from start: String, days: Int = 7) -> (added: Int, updated: Int) {
        let items = fetch(ShoppingItem.self)
        let gap = MealPlanner.listGap(for: weekShortages(from: start, days: days).missingIngredients, on: items.map(\.listRow))
        let byID = Dictionary(items.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        for update in gap.updates {
            guard let item = byID[update.id] else { continue }
            if item.quantity != update.quantity { item.quantity = update.quantity }
            if item.unit != update.unit { item.unit = update.unit }
            if item.note != update.note { item.note = update.note }
            item.touch()
        }
        for addition in gap.additions {
            let item = ShoppingItem(name: addition.name, quantity: addition.quantity, unit: addition.unit, source: .mealPlan)
            item.note = addition.note
            item.category = categoryGuess(for: addition.name)
            context.insert(item)
        }
        changed()
        return (gap.additions.count, gap.updates.count)
    }
}

extension ShoppingItem {
    var listRow: MealPlanner.ListRow {
        MealPlanner.ListRow(id: uuid, name: name, quantity: quantity, unit: unit, checked: checked, note: note, createdAt: createdAt)
    }
}
