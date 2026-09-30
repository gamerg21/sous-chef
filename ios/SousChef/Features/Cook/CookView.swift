import SwiftData
import SwiftUI

/// "What can I cook?" — recipes ranked by how much of them the pantry covers,
/// with food that expires soon pulled to the front.
struct CookView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Query private var recipes: [Recipe]
    @Query private var pantry: [PantryItem]
    @Query(filter: #Predicate<PlannedMeal> { $0.cookedAt == nil }) private var openMeals: [PlannedMeal]
    @State private var cooking: Recipe?
    @State private var cookingMeal: PlannedMeal?
    @State private var ideas = false
    @Bindable private var navigator = AppNavigator.shared
    @AppStorage(ExpiringFood.windowDaysKey, store: ExpiringFood.settings) private var windowDays = ExpiringFood.defaultWindowDays

    /// Ranking reruns only when recipes, the pantry, the window or the day change.
    @State private var ranking = Memo<Int, [Kitchen.RecipeSuggestion]>()

    private var ranked: [Kitchen.RecipeSuggestion] {
        var key = Hasher()
        key.combine(Kitchen.readinessKey(recipes: recipes, pantry: pantry))
        key.combine(windowDays)
        key.combine(Calendar.current.startOfDay(for: .now))
        return ranking(key.finalize()) { Kitchen.rankRecipes(recipes, pantry: pantry, within: windowDays) }
    }

    var body: some View {
        NavigationStack {
            let ranked = ranked
            let usingUp = Kitchen.rankForUsingUp(ranked)
            List {
                if !recipes.isEmpty {
                    let ready = ranked.filter { $0.missing == 0 }
                    heroCard(readyCount: ready.count, total: ranked.count, usingUpCount: usingUp.count)
                    planSection
                    if navigator.cookShowsExpiring {
                        if usingUp.isEmpty {
                            ContentUnavailableView("Nothing to use up", systemImage: "leaf",
                                                   description: Text("None of your recipes use food that expires in the next \(windowDays) day\(windowDays == 1 ? "" : "s")."))
                        } else {
                            section("Uses food that expires soon", symbol: "hourglass", items: usingUp)
                        }
                    } else {
                        let almost = ranked.filter { (1...2).contains($0.missing) }
                        let rest = ranked.filter { $0.missing > 2 }
                        section("Ready now", symbol: "checkmark.seal", items: ready)
                        section("Almost there", symbol: "cart", items: almost)
                        section("Needs a shop", symbol: "basket", items: rest)
                    }
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
            .navigationDestination(for: PlanRoute.self) { _ in PlanView() }
            .toolbar {
                SettingsToolbarButton(showSettings: $showSettings)
                if kitchen.ai.canGenerateRecipes {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { ideas = true } label: { Label("Suggest a recipe", systemImage: "apple.intelligence") }
                    }
                }
            }
            .fullScreenCover(item: $cooking) { CookModeView(recipe: $0, scale: 1).kitchenEnvironment(kitchen) }
            .fullScreenCover(item: $cookingMeal) { meal in
                if let recipe = kitchen.recipe(for: meal) {
                    CookModeView(recipe: recipe, scale: kitchen.scale(for: meal), meal: meal)
                        .kitchenEnvironment(kitchen)
                }
            }
            .sheet(isPresented: $ideas) {
                RecipeImportView(mode: .ideas) { draft in
                    ideas = false
                    kitchen.save(draft)
                }
                .kitchenEnvironment(kitchen)
            }
        }
    }

    private var mealLabel: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<11: "This morning"
        case 11..<16: "This afternoon"
        default: "Tonight"
        }
    }

    /// Tonight's planned meal, if any, and the way into the week plan.
    private var planSection: some View {
        Section {
            if let meal = MealPlanner.tonight(in: openMeals), let recipe = kitchen.recipe(for: meal) {
                HStack(spacing: 12) {
                    RecipeImage(data: recipe.photo)
                        .frame(width: 52, height: 52)
                        .clipShape(.rect(cornerRadius: 12, style: .continuous))
                    VStack(alignment: .leading, spacing: 3) {
                        Eyebrow("Planned · \(meal.slot.title)", systemImage: meal.slot.symbol)
                        Text(recipe.title).font(.body.weight(.semibold)).lineLimit(2)
                    }
                    Spacer()
                    Button("Cook", systemImage: "flame") { cookingMeal = meal }
                        .buttonStyle(.glassProminent)
                        .labelStyle(.titleAndIcon)
                        .fixedSize()
                }
            }
            NavigationLink(value: PlanRoute()) {
                Label("This week's plan", systemImage: "calendar")
            }
        }
    }

    private func heroCard(readyCount: Int, total: Int, usingUpCount: Int) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                Eyebrow(mealLabel, systemImage: "sparkles")
                Text(readyCount == 0 ? "Nothing's fully stocked yet" : "You can cook \(readyCount) recipe\(readyCount == 1 ? "" : "s") right now")
                    .font(.system(.title2, design: .rounded, weight: .bold))
                Text(navigator.cookShowsExpiring
                     ? "Recipes that use the most food expiring soon come first."
                     : "Ranked by what's in your pantry, with food that expires soon first.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Picker("Show", selection: $navigator.cookShowsExpiring) {
                    Text("All recipes").tag(false)
                    Text(usingUpCount > 0 ? "Use it up (\(usingUpCount))" : "Use it up").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.top, 4)
            }
            .padding(.vertical, 6)
        }
    }

    /// "Uses spinach (tomorrow), milk (in 2 days)".
    private func usesText(_ items: [ExpiringFood]) -> String {
        let parts = items.prefix(3).map { item in
            let phrase = ExpiringFood.phrase(daysLeft: item.daysLeft)
            let when = phrase.hasPrefix("expires ") ? String(phrase.dropFirst("expires ".count)) : phrase
            return "\(item.name) (\(when))"
        }
        return "Uses " + parts.joined(separator: ", ") + (items.count > 3 ? "…" : "")
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
                                if let soonest = item.expiringItems.first {
                                    Label(usesText(item.expiringItems), systemImage: "clock.badge.exclamationmark")
                                        .font(.caption)
                                        .foregroundStyle(soonest.daysLeft <= 0 ? .red : .orange)
                                        .lineLimit(2)
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
