import SwiftUI

/// A planned meal: its slot, recipe, servings and pantry readiness. Opens the
/// recipe; swipe to cook or remove, and long-press to change it.
struct PlannedMealRow: View {
    let meal: PlannedMeal
    let recipe: Recipe?
    let stock: [StockLine]
    var onCook: (PlannedMeal) -> Void

    @Environment(Kitchen.self) private var kitchen

    var body: some View {
        Group {
            if let recipe {
                NavigationLink(value: recipe) { content(recipe) }
            } else {
                content(nil)
            }
        }
        .swipeActions(edge: .leading) {
            if recipe != nil && !meal.isCooked {
                Button("Cook", systemImage: "flame") { onCook(meal) }
                    .tint(Color.brand)
            }
        }
        .swipeActions(edge: .trailing) {
            Button("Remove", systemImage: "trash", role: .destructive) {
                kitchen.delete(meal)
                kitchen.changed()
            }
        }
        .contextMenu {
            if recipe != nil && !meal.isCooked {
                Button("Cook", systemImage: "flame") { onCook(meal) }
            }
            Button(meal.isCooked ? "Mark Not Cooked" : "Mark Cooked", systemImage: meal.isCooked ? "arrow.uturn.backward" : "checkmark") {
                kitchen.setCooked(meal, !meal.isCooked)
            }
            Menu("Move to", systemImage: "arrow.left.arrow.right") {
                ForEach(MealSlot.allCases.filter { $0 != meal.slot }) { slot in
                    Button(slot.title, systemImage: slot.symbol) { update { meal.slot = slot } }
                }
            }
            if let servings = meal.servings {
                Button("More Servings", systemImage: "plus") { update { meal.servings = min(100, servings + 1) } }
                Button("Fewer Servings", systemImage: "minus") { update { meal.servings = max(1, servings - 1) } }
                    .disabled(servings <= 1)
            }
            Divider()
            Button("Remove", systemImage: "trash", role: .destructive) {
                kitchen.delete(meal)
                kitchen.changed()
            }
        }
    }

    private func content(_ recipe: Recipe?) -> some View {
        HStack(spacing: 12) {
            RecipeImage(data: recipe?.photo)
                .frame(width: 52, height: 52)
                .clipShape(.rect(cornerRadius: 12, style: .continuous))
                .opacity(meal.isCooked ? 0.5 : 1)
            VStack(alignment: .leading, spacing: 3) {
                Eyebrow(meal.slot.title, systemImage: meal.slot.symbol)
                Text(recipe?.title ?? "Deleted recipe")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(meal.isCooked ? .secondary : .primary)
                    .lineLimit(2)
                HStack(spacing: 8) {
                    if meal.isCooked {
                        Label("Cooked", systemImage: "checkmark.circle.fill")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color.brand)
                    } else if let recipe, !recipe.ingredients.isEmpty {
                        ReadinessBadge(plan: plan(recipe))
                    }
                    if let servings = meal.servings {
                        Text("\(servings) serving\(servings == 1 ? "" : "s")").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if let note = meal.note {
                    Text(note).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Readiness against today's pantry, as on the Cook screen.
    private func plan(_ recipe: Recipe) -> CookingPlan {
        CookingPlanner.plan(ingredients: MealPlanner.scaled(recipe.ingredients, by: MealPlanner.scale(servings: meal.servings, recipeServings: recipe.servings)), stock: stock)
    }

    private func update(_ change: () -> Void) {
        change()
        meal.touch()
        kitchen.changed()
    }
}
