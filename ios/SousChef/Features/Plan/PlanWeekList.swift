import SwiftData
import SwiftUI

/// One week of planned meals. The query is rebuilt for each week shown.
struct PlanWeekList: View {
    let weekStart: String
    var onPlan: (String) -> Void
    var onCook: (PlannedMeal) -> Void
    var onAddShortages: () -> Void

    @Environment(Kitchen.self) private var kitchen
    @Query private var meals: [PlannedMeal]
    @Query private var recipes: [Recipe]
    @Query private var pantry: [PantryItem]

    init(weekStart: String, onPlan: @escaping (String) -> Void, onCook: @escaping (PlannedMeal) -> Void, onAddShortages: @escaping () -> Void) {
        self.weekStart = weekStart
        self.onPlan = onPlan
        self.onCook = onCook
        self.onAddShortages = onAddShortages
        let end = MealPlanner.day(weekStart, adding: 7)
        _meals = Query(filter: #Predicate<PlannedMeal> { $0.day >= weekStart && $0.day < end })
    }

    var body: some View {
        let recipesByID = Dictionary(recipes.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        let stock = pantry.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
        let today = MealPlanner.day(.now)
        List {
            shortagesCard(recipesByID: recipesByID, stock: stock)
            ForEach(MealPlanner.week(from: weekStart), id: \.self) { day in
                Section {
                    ForEach(mealsOn(day)) { meal in
                        PlannedMealRow(meal: meal, recipe: meal.recipeUUID.flatMap { recipesByID[$0] }, stock: stock, onCook: onCook)
                    }
                    Button { onPlan(day) } label: {
                        Label(mealsOn(day).isEmpty ? "Plan a meal" : "Add another meal", systemImage: "plus")
                    }
                } header: {
                    HStack {
                        Eyebrow(MealPlanner.date(day).formatted(.dateTime.weekday(.wide).day().month()), systemImage: day == today ? "sun.max" : nil)
                        if day == today { Chip(text: "Today") }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func mealsOn(_ day: String) -> [PlannedMeal] {
        meals.filter { $0.day == day }.sorted { ($0.slot.order, $0.createdAt) < ($1.slot.order, $1.createdAt) }
    }

    private func shortagesCard(recipesByID: [UUID: Recipe], stock: [StockLine]) -> some View {
        let open = meals.filter { !$0.isCooked }
        let shortages = MealPlanner.shortages(for: open.compactMap { meal in
            meal.recipeUUID.flatMap { recipesByID[$0] }.map { MealPlanner.scaled($0.ingredients, by: MealPlanner.scale(servings: meal.servings, recipeServings: $0.servings)) }
        }, stock: stock)
        let count = shortages.missingIngredients.count
        return Section {
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow("Shopping for the week", systemImage: "cart")
                Text(open.isEmpty ? "No meals left to shop for" : count == 0 ? "Your pantry covers every planned meal" : "\(count) item\(count == 1 ? "" : "s") short across \(open.count) meal\(open.count == 1 ? "" : "s")")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                if count > 0 {
                    Text(shortages.missingIngredients.prefix(4).map { "\(Units.amount($0.quantity, $0.unit)) \($0.name)".trimmingCharacters(in: .whitespaces) }.joined(separator: " · ") + (count > 4 ? " …" : ""))
                        .font(.callout)
                        .foregroundStyle(.secondary)
                    Button(action: onAddShortages) {
                        Label("Add week's shortages to list", systemImage: "cart.badge.plus")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.glassProminent)
                    .padding(.top, 4)
                }
                if !shortages.checks.isEmpty {
                    Label("\(shortages.checks.count) ingredient\(shortages.checks.count == 1 ? "" : "s") need an amount or unit check by hand.", systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 6)
        }
    }
}
