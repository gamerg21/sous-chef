import SwiftData
import SwiftUI

struct RecipesView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Query(sort: \Recipe.createdAt, order: .reverse) private var recipes: [Recipe]
    @Query private var pantry: [PantryItem]
    @Query private var meals: [PlannedMeal]
    @AppStorage(ExpiringFood.windowDaysKey, store: ExpiringFood.settings) private var windowDays = ExpiringFood.defaultWindowDays
    @State private var period = RecipeStats.Period.month
    @State private var search = ""
    @State private var filter: Filter = .all
    @State private var creating: RecipeDraftSession?
    @State private var importMode: RecipeImportView.Mode?
    @State private var sharedImport: SharedImport?
    @State private var path = NavigationPath()
    /// Unfolded or on a wide screen, the library's numbers sit beside it.
    @State private var twoPane = false
    private let navigator = AppNavigator.shared

    enum Filter: Hashable {
        case all, favorites, ready, tag(String)
        /// From the at-a-glance pane beside the library.
        case almost, popular, recent, quick, expiring

        /// The pane's filters, which get a chip of their own while on.
        var paneTitle: (title: String, symbol: String)? {
            switch self {
            case .almost: ("Almost there", "cart")
            case .popular: ("Popular", "flame")
            case .recent: ("Newly added", "sparkles")
            case .quick: ("Quick", "timer")
            case .expiring: ("Uses food expiring soon", "hourglass")
            default: nil
            }
        }
    }

    /// Something shared from another app, on its way through import and review.
    struct SharedImport: Identifiable {
        let id = UUID()
        var mode: RecipeImportView.Mode
        var content: String
    }

    private var tags: [String] {
        Array(Set(recipes.flatMap(\.tags))).sorted().prefix(20).map { $0 }
    }

    /// Pantry readiness and search text per recipe, rebuilt only when recipes
    /// or the pantry change rather than on every keystroke.
    private struct Readiness {
        var plans: [UUID: CookingPlan] = [:]
        var searchText: [UUID: String] = [:]
    }

    @State private var readinessCache = Memo<Int, Readiness>()

    private var readiness: Readiness {
        readinessCache(Kitchen.readinessKey(recipes: recipes, pantry: pantry)) {
            let stock = pantry.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
            var readiness = Readiness()
            for recipe in recipes {
                let ingredients = recipe.ingredients
                if !ingredients.isEmpty { readiness.plans[recipe.uuid] = CookingPlanner.plan(ingredients: ingredients, stock: stock) }
                readiness.searchText[recipe.uuid] = ([recipe.title] + recipe.tags + ingredients.map(\.name)).joined(separator: "\n")
            }
            return readiness
        }
    }

    @State private var statsCache = Memo<Int, RecipeStats>()

    /// The at-a-glance numbers, rebuilt when recipes, the pantry, the plan,
    /// the expiry window or the period change.
    private var stats: RecipeStats {
        var key = Hasher()
        key.combine(Kitchen.readinessKey(recipes: recipes, pantry: pantry))
        key.combine(meals.map { "\($0.recipeUUID?.uuidString ?? "")\($0.day)" })
        key.combine(recipes.map(\.lastCookedAt))
        key.combine(windowDays)
        key.combine(period)
        key.combine(Calendar.current.startOfDay(for: .now))
        return statsCache(key.finalize()) {
            let suggestions = Dictionary(Kitchen.rankRecipes(recipes, pantry: pantry, within: windowDays).map { ($0.recipe.uuid, $0) }, uniquingKeysWith: { first, _ in first })
            let entries = recipes.map { recipe in
                RecipeStats.Entry(id: recipe.uuid, createdAt: recipe.createdAt, lastCookedAt: recipe.lastCookedAt, minutes: recipe.totalTimeMinutes,
                                  tags: recipe.tags, missing: suggestions[recipe.uuid]?.missing, usesExpiring: !(suggestions[recipe.uuid]?.expiringItems.isEmpty ?? true))
            }
            return RecipeStats.compute(entries, meals: meals.compactMap { meal in meal.recipeUUID.map { ($0, meal.day) } }, period: period)
        }
    }

    private func visible(_ readiness: Readiness) -> [Recipe] {
        let stats = filter.paneTitle == nil ? RecipeStats() : stats
        let matching = recipes.filter { recipe in
            let matchesSearch = search.isEmpty || readiness.searchText[recipe.uuid, default: recipe.title].localizedStandardContains(search)
            let matchesFilter = switch filter {
            case .all: true
            case .favorites: recipe.favorited
            case .ready: readiness.plans[recipe.uuid]?.missingIngredients.isEmpty == true
            case .tag(let tag): recipe.tags.contains(tag)
            case .almost: stats.almost.contains(recipe.uuid)
            case .popular: stats.popular.contains { $0.id == recipe.uuid }
            case .recent: stats.recent.contains(recipe.uuid)
            case .quick: stats.quick.contains(recipe.uuid)
            case .expiring: stats.expiring.contains(recipe.uuid)
            }
            return matchesSearch && matchesFilter
        }
        // Popular shows the most popular first; the rest keep newest first.
        guard filter == .popular else { return matching }
        let rank = Dictionary(stats.popular.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { first, _ in first })
        return matching.sorted { rank[$0.uuid, default: .max] < rank[$1.uuid, default: .max] }
    }

    var body: some View {
        Group {
            if twoPane {
                TwoPane {
                    RecipeInsightsPane(stats: stats, recipes: recipes, filter: $filter, period: $period) { recipe in
                        path = NavigationPath([recipe])
                    }
                } secondary: {
                    library
                }
            } else {
                library
            }
        }
        .tracksTwoPaneWidth($twoPane)
    }

    private var library: some View {
        NavigationStack(path: $path) {
            let readiness = readiness
            let plans = readiness.plans
            let shown = visible(readiness)
            ScrollView {
                if recipes.isEmpty {
                    emptyState.padding(.top, 60)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        filterBar
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 14) {
                            ForEach(shown) { recipe in
                                NavigationLink(value: recipe) {
                                    RecipeCard(recipe: recipe, plan: plans[recipe.uuid])
                                }
                                .buttonStyle(.plain)
                                .contextMenu { contextMenu(for: recipe) }
                            }
                        }
                        if shown.isEmpty {
                            ContentUnavailableView.search(text: search)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Recipes")
            .searchable(text: $search, prompt: "Recipes, tags or ingredients")
            // A fresh view per recipe, so opening one from Siri over another
            // doesn't carry over its servings or cook state.
            .navigationDestination(for: Recipe.self) { RecipeDetailView(recipe: $0).id($0.uuid) }
            .toolbar {
                SettingsToolbarButton(showSettings: $showSettings)
                ToolbarItem(placement: .topBarTrailing) { addMenu }
            }
            // Siri and Shortcuts open recipes through the navigator.
            .task(id: navigator.recipeToOpen) {
                guard let id = navigator.recipeToOpen else { return }
                navigator.recipeToOpen = nil
                if let recipe = recipes.first(where: { $0.uuid == id }) { path = NavigationPath([recipe]) }
            }
            // Recipes shared from other apps, one at a time, once nothing
            // else is being added.
            .task(id: navigator.sharedRecipes.first) { importNextShared() }
            .refreshable { await kitchen.server.syncNow() }
            .sheet(item: $creating, onDismiss: importNextShared) { session in
                RecipeEditorView(draft: session.draft, recipe: nil) { saved in
                    path.append(saved)
                }
                .kitchenEnvironment(kitchen)
            }
            .sheet(item: $sharedImport, onDismiss: importNextShared) { shared in
                RecipeImportFlow(mode: shared.mode, shared: shared.content) { saved in path.append(saved) }
                    .kitchenEnvironment(kitchen)
            }
            .sheet(item: $importMode, onDismiss: importNextShared) { mode in
                RecipeImportFlow(mode: mode) { saved in path.append(saved) }
                    .kitchenEnvironment(kitchen)
            }
        }
    }

    private func importNextShared() {
        guard creating == nil, importMode == nil, sharedImport == nil, !navigator.sharedRecipes.isEmpty else { return }
        switch navigator.sharedRecipes.removeFirst() {
        case .link(let url):
            // A page that's already saved opens instead of importing twice.
            if let existing = kitchen.recipe(importedFrom: url) {
                path = NavigationPath([existing])
                importNextShared()
            } else {
                sharedImport = SharedImport(mode: .link, content: url.absoluteString)
            }
        case .text(let text):
            sharedImport = SharedImport(mode: .text, content: text)
        }
    }

    private var addMenu: some View {
        Menu {
            Button { creating = RecipeDraftSession(draft: RecipeDraft()) } label: { Label("New recipe", systemImage: "square.and.pencil") }
            Button { importMode = .link } label: { Label("Import from a link", systemImage: "link") }
            Button { importMode = .photo } label: { Label("Scan a recipe", systemImage: "doc.text.viewfinder") }
            Button { importMode = .text } label: { Label("Paste recipe text", systemImage: "doc.on.clipboard") }
            Divider()
            Button { importMode = .ideas } label: { Label("Recipe ideas", systemImage: "apple.intelligence") }
        } label: {
            Label("Add recipe", systemImage: "plus")
        }
        .accessibilityIdentifier("addRecipe")
    }

    private var filterBar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                // A filter set from the pane beside the library.
                if let pane = filter.paneTitle {
                    Button {
                        withAnimation(.snappy) { filter = .all }
                    } label: {
                        HStack(spacing: 4) {
                            Chip(text: pane.title, systemImage: pane.symbol, selected: true)
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(pane.title), clear filter")
                    .transition(.scale.combined(with: .opacity))
                }
                filterChip("All", .all, symbol: nil)
                filterChip("Favorites", .favorites, symbol: "heart.fill")
                filterChip("Ready to cook", .ready, symbol: "checkmark.circle.fill")
                ForEach(tags, id: \.self) { filterChip($0, .tag($0), symbol: "number") }
            }
        }
        .scrollIndicators(.hidden)
        // Edge to edge within the safe area, fading out at the end, so chips
        // never slide under the unfolded Duo's tab rail or status.
        .contentMargins(.horizontal, 16, for: .scrollContent)
        .padding(.horizontal, -16)
        .mask {
            LinearGradient(stops: [.init(color: .black, location: 0.9), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing)
        }
    }

    private func filterChip(_ title: String, _ value: Filter, symbol: String?) -> some View {
        Button {
            withAnimation(.snappy) { filter = filter == value ? .all : value }
        } label: {
            Chip(text: title, systemImage: symbol, selected: filter == value)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func contextMenu(for recipe: Recipe) -> some View {
        Button {
            recipe.favorited.toggle()
            kitchen.changed()
        } label: {
            Label(recipe.favorited ? "Unfavorite" : "Favorite", systemImage: recipe.favorited ? "heart.slash" : "heart")
        }
        Button { kitchen.addShortages(for: recipe) } label: { Label("Add missing to list", systemImage: "cart.badge.plus") }
        Button(role: .destructive) {
            kitchen.delete(recipe, undoable: true)
            kitchen.changed()
        } label: { Label("Delete", systemImage: "trash") }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No recipes yet", systemImage: "book.pages")
        } description: {
            Text("Import a recipe from any website, scan a cookbook page, paste one in, or let Apple Intelligence suggest something.")
        } actions: {
            Button { importMode = .link } label: { Label("Import from a link", systemImage: "link") }.buttonStyle(.glassProminent).fixedSize()
            Button { importMode = .photo } label: { Label("Scan a cookbook page", systemImage: "doc.text.viewfinder") }.buttonStyle(.glass).fixedSize()
            Button { importMode = .ideas } label: { Label("Recipe ideas", systemImage: "apple.intelligence") }.buttonStyle(.glass).fixedSize()
            Button("Write one") { creating = RecipeDraftSession(draft: RecipeDraft()) }
        }
    }
}

struct RecipeDraftSession: Identifiable {
    let id = UUID()
    var draft: RecipeDraft
}

struct RecipeCard: View {
    let recipe: Recipe
    /// Nil for recipes without ingredients.
    let plan: CookingPlan?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RecipeImage(data: recipe.photo)
                .frame(height: 120)
                .frame(maxWidth: .infinity)
                .clipped()
                .overlay(alignment: .topTrailing) {
                    if recipe.favorited {
                        Image(systemName: "heart.fill")
                            .font(.caption)
                            .foregroundStyle(.pink)
                            .padding(7)
                            .glassEffect(.regular, in: .circle)
                            .padding(8)
                    }
                }
            VStack(alignment: .leading, spacing: 6) {
                Text(recipe.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(2, reservesSpace: true)
                    .foregroundStyle(.primary)
                HStack(spacing: 6) {
                    if let minutes = recipe.totalTimeMinutes {
                        Label("\(minutes) min", systemImage: "timer").font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    ReadinessBadge(plan: plan)
                }
            }
            .padding(10)
        }
        .background(.background.secondary)
        .clipShape(.rect(cornerRadius: 20, style: .continuous))
        .contentShape(.rect(cornerRadius: 20, style: .continuous))
    }
}

struct ReadinessBadge: View {
    /// Nil for recipes without ingredients, which show no badge.
    let plan: CookingPlan?

    var body: some View {
        if let plan {
            if plan.missingIngredients.isEmpty {
                Label("Ready", systemImage: "checkmark.circle.fill")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Color.brand)
            } else {
                Text("Need \(plan.missingIngredients.count)")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.orange)
            }
        }
    }
}
