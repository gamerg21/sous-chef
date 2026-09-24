import SwiftData
import SwiftUI

/// "What can I cook?" — recipes ranked by how much of them the pantry covers,
/// with food that expires soon pulled to the front.
struct CookView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Query private var recipes: [Recipe]
    @Query private var pantry: [PantryItem]
    @State private var cooking: Recipe?
    @State private var ideas = false

    /// Ranking reruns only when recipes or the pantry change.
    @State private var ranking = Memo<Int, [Kitchen.RecipeSuggestion]>()

    private var ranked: [Kitchen.RecipeSuggestion] {
        ranking(Kitchen.readinessKey(recipes: recipes, pantry: pantry)) { Kitchen.rankRecipes(recipes, pantry: pantry) }
    }

    var body: some View {
        NavigationStack {
            let ranked = ranked
            List {
                if !recipes.isEmpty {
                    let ready = ranked.filter { $0.missing == 0 }
                    let almost = ranked.filter { (1...2).contains($0.missing) }
                    let rest = ranked.filter { $0.missing > 2 }
                    heroCard(readyCount: ready.count, total: ranked.count)
                    section("Ready now", symbol: "checkmark.seal", items: ready)
                    section("Almost there", symbol: "cart", items: almost)
                    section("Needs a shop", symbol: "basket", items: rest)
                }
            }
            .listStyle(.insetGrouped)
            .overlay {
                if recipes.isEmpty {
                    ContentUnavailableView {
                        Label("Nothing to cook yet", systemImage: "frying.pan")
                    } description: {
                        Text("Add recipes and pantry items, and Sous Chef will show what you can make right now.")
                    } actions: {
                        if kitchen.ai.canGenerateRecipes {
                            Button { ideas = true } label: { Label("Suggest a recipe", systemImage: "apple.intelligence") }
                                .buttonStyle(.glassProminent)
                                .fixedSize()
                        }
                    }
                }
            }
            .navigationTitle("Cook")
            .navigationDestination(for: Recipe.self) { RecipeDetailView(recipe: $0) }
            .toolbar {
                SettingsToolbarButton(showSettings: $showSettings)
                if kitchen.ai.canGenerateRecipes {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { ideas = true } label: { Label("Suggest a recipe", systemImage: "apple.intelligence") }
                    }
                }
            }
            .fullScreenCover(item: $cooking) { CookModeView(recipe: $0, scale: 1) }
            .sheet(isPresented: $ideas) {
                RecipeImportView(mode: .ideas) { draft in
                    ideas = false
                    kitchen.save(draft)
                }
            }
        }
    }

    private func heroCard(readyCount: Int, total: Int) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow("Tonight", systemImage: "sparkles")
                Text(readyCount == 0 ? "Nothing's fully stocked yet" : "You can cook \(readyCount) recipe\(readyCount == 1 ? "" : "s") right now")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                Text("Ranked by what's in your pantry, with food that expires soon first.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 6)
        }
    }

    @ViewBuilder
    private func section(_ title: String, symbol: String, items: [Kitchen.RecipeSuggestion]) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { item in
                    NavigationLink(value: item.recipe) {
                        HStack(spacing: 12) {
                            RecipeImage(data: item.recipe.photo)
                                .frame(width: 58, height: 58)
                                .clipShape(.rect(cornerRadius: 14, style: .continuous))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.recipe.title).font(.body.weight(.semibold)).lineLimit(2)
                                if item.missing > 0 {
                                    Text("Need " + item.plan.missingIngredients.prefix(3).map(\.name).joined(separator: ", ") + (item.missing > 3 ? "…" : ""))
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                        .lineLimit(1)
                                } else if let minutes = item.recipe.totalTimeMinutes {
                                    Label("\(minutes) min", systemImage: "timer").font(.caption).foregroundStyle(.secondary)
                                }
                                if !item.usesExpiring.isEmpty {
                                    Label("Uses " + item.usesExpiring.prefix(2).joined(separator: ", "), systemImage: "clock.badge.exclamationmark")
                                        .font(.caption)
                                        .foregroundStyle(.red)
                                        .lineLimit(1)
                                }
                            }
                        }
                    }
                    .swipeActions(edge: .leading) {
                        Button { cooking = item.recipe } label: { Label("Cook", systemImage: "flame") }.tint(Color.brand)
                    }
                    .swipeActions(edge: .trailing) {
                        if item.missing > 0 {
                            Button { kitchen.addShortages(for: item.recipe, missing: item.plan.missingIngredients) } label: { Label("Add to list", systemImage: "cart.badge.plus") }
                                .tint(.blue)
                        }
                    }
                }
            } header: {
                Eyebrow(title, systemImage: symbol)
            }
        }
    }
}
