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

    func delete(_ meal: PlannedMeal) {
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

    /// Adds the week's shortages to the list without duplicating what's there.
    /// Items for the same food in a comparable unit count toward the need,
    /// including ones already in the cart; any extra tops up an unticked item,
    /// so doing it twice changes nothing. Mirrors the server's merge.
    @discardableResult
    func addWeekShortages(from start: String, days: Int = 7) -> (added: Int, updated: Int) {
        let shortages = weekShortages(from: start, days: days).missingIngredients
        var items = fetch(ShoppingItem.self)
        var added = 0, updated = 0
        for need in shortages {
            let sameFood = items.filter { normalizeName($0.name) == normalizeName(need.name) }
            guard let quantity = need.quantity else {
                if sameFood.isEmpty { items.append(insertShopping(need.name, quantity: nil, unit: need.unit)); added += 1 }
                continue
            }
            let comparable = sameFood.filter { $0.quantity != nil && Units.convert(1, from: $0.unit, to: need.unit) != nil }
            let covered = comparable.reduce(0) { $0 + (Units.convert($1.quantity!, from: $1.unit, to: need.unit) ?? 0) }
            guard covered + 0.000001 < quantity else { continue }
            let extra = quantity - covered
            if let open = comparable.first(where: { !$0.checked }) {
                open.quantity = MealPlanner.rounded(open.quantity! + (Units.convert(extra, from: need.unit, to: open.unit) ?? 0))
                open.touch()
                updated += 1
            } else if let unmeasured = sameFood.first(where: { !$0.checked && $0.quantity == nil }) {
                unmeasured.quantity = MealPlanner.rounded(extra)
                unmeasured.unit = need.unit
                unmeasured.touch()
                updated += 1
            } else {
                items.append(insertShopping(need.name, quantity: MealPlanner.rounded(extra), unit: need.unit))
                added += 1
            }
        }
        changed()
        return (added, updated)
    }

    private func insertShopping(_ name: String, quantity: Double?, unit: String?) -> ShoppingItem {
        let item = ShoppingItem(name: name, quantity: quantity, unit: unit, source: .mealPlan)
        item.category = categoryGuess(for: name)
        context.insert(item)
        return item
    }
}
