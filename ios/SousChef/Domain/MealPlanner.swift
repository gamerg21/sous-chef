import Foundation

/// Meal plan decisions that don't need the store: scaling, the week's
/// shortages, and which meal is next. Ports `planShortages` and
/// `combineShortages` from `src/lib/cooking-plan.ts`.
enum MealPlanner {
    struct Shortages: Equatable {
        var missingIngredients: [CookingPlan.Missing] = []
        var checks: [CookingPlan.Check] = []
        var meals = 0
    }

    // MARK: Days

    /// A day key ("YYYY-MM-DD") for a date in the person's time zone.
    static func day(_ date: Date) -> String { DayFormat.string(date) ?? "" }

    static func date(_ day: String) -> Date { DayFormat.date(day) ?? .now }

    static func day(_ day: String, adding days: Int, calendar: Calendar = .current) -> String {
        Self.day(calendar.date(byAdding: .day, value: days, to: date(day)) ?? date(day))
    }

    /// The first day of the week containing `date`, following the person's calendar.
    static func weekStart(for date: Date = .now, calendar: Calendar = .current) -> String {
        day(calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? date)
    }

    static func week(from start: String) -> [String] {
        (0..<7).map { day(start, adding: $0) }
    }

    // MARK: Amounts

    /// Planned servings over the recipe's own servings; 1 when either is unknown.
    static func scale(servings: Int?, recipeServings: Int?) -> Double {
        guard let servings, let base = recipeServings, servings > 0, base > 0 else { return 1 }
        return Double(servings) / Double(base)
    }

    static func scaled(_ ingredients: [Ingredient], by factor: Double) -> [Ingredient] {
        guard factor != 1 else { return ingredients }
        return ingredients.map { ingredient in
            var copy = ingredient
            copy.quantity = ingredient.quantity.map { rounded($0 * factor) }
            return copy
        }
    }

    /// Folds shortages of the same food into one line per comparable unit,
    /// converting into the first unit seen (250 ml + 1 l = 1250 ml). Units that
    /// can't be compared stay separate; an unspecified amount joins a measured
    /// line of the same food rather than adding its own.
    static func combine(_ missing: [CookingPlan.Missing]) -> [CookingPlan.Missing] {
        var combined: [CookingPlan.Missing] = []
        for item in missing {
            let sameFood = combined.indices.filter { normalizeName(combined[$0].name) == normalizeName(item.name) }
            guard let quantity = item.quantity else {
                if sameFood.isEmpty { combined.append(item) }
                continue
            }
            if let index = sameFood.first(where: { combined[$0].quantity != nil && Units.convert(1, from: item.unit, to: combined[$0].unit) != nil }) {
                combined[index].quantity = rounded(combined[index].quantity! + Units.convert(quantity, from: item.unit, to: combined[index].unit)!)
            } else if let index = sameFood.first(where: { combined[$0].quantity == nil }) {
                combined[index].quantity = quantity
                combined[index].unit = item.unit
            } else {
                combined.append(item)
            }
        }
        return combined
    }

    /// What several meals need beyond the pantry. Every ingredient draws on the
    /// same stock in turn, so food one meal uses isn't counted again for the next.
    static func shortages(for recipes: [[Ingredient]], stock: [StockLine]) -> Shortages {
        let ingredients = recipes.flatMap(\.self)
        guard !ingredients.isEmpty else { return Shortages(meals: recipes.count) }
        let plan = CookingPlanner.plan(ingredients: ingredients, stock: stock)
        return Shortages(missingIngredients: combine(plan.missingIngredients), checks: plan.checks, meals: recipes.count)
    }

    // MARK: What's next

    /// The meal to show for "tonight": today's uncooked dinner, otherwise
    /// today's next uncooked meal from the current time of day on, otherwise
    /// any uncooked meal today. Nil when nothing is left to cook today.
    static func tonight(in meals: [PlannedMeal], now: Date = .now, calendar: Calendar = .current) -> PlannedMeal? {
        let today = day(now)
        let open = meals.filter { $0.day == today && !$0.isCooked }
            .sorted { ($0.slot.order, $0.createdAt) < ($1.slot.order, $1.createdAt) }
        if let dinner = open.first(where: { $0.slot == .dinner }) { return dinner }
        let hour = calendar.component(.hour, from: now)
        let current: MealSlot = hour < 11 ? .breakfast : hour < 16 ? .lunch : .dinner
        return open.first { $0.slot.order >= current.order } ?? open.first
    }

    static func rounded(_ value: Double) -> Double { Double(String(format: "%.6g", value)) ?? value }
}
