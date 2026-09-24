import SwiftData
import SwiftUI

struct RecipesView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Query(sort: \Recipe.createdAt, order: .reverse) private var recipes: [Recipe]
    @Query private var pantry: [PantryItem]
    @State private var search = ""
    @State private var filter: Filter = .all
    @State private var creating: RecipeDraftSession?
    @State private var importMode: RecipeImportView.Mode?
    @State private var sharedImport: SharedImport?
    @State private var sharedDraft: RecipeDraft?
    @State private var path = NavigationPath()
    private let navigator = AppNavigator.shared

    enum Filter: Hashable {
        case all, favorites, ready, tag(String)
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

    private func visible(_ readiness: Readiness) -> [Recipe] {
        recipes.filter { recipe in
            let matchesSearch = search.isEmpty || readiness.searchText[recipe.uuid, default: recipe.title].localizedStandardContains(search)
            let matchesFilter = switch filter {
            case .all: true
            case .favorites: recipe.favorited
            case .ready: readiness.plans[recipe.uuid]?.missingIngredients.isEmpty == true
            case .tag(let tag): recipe.tags.contains(tag)
            }
            return matchesSearch && matchesFilter
        }
    }

    var body: some View {
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
            }
            .sheet(item: $sharedImport, onDismiss: reviewSharedDraft) { shared in
                RecipeImportView(mode: shared.mode, shared: shared.content) { draft in
                    sharedDraft = draft
                    sharedImport = nil
                }
            }
            .sheet(item: $importMode) { mode in
                RecipeImportView(mode: mode) { draft in
                    importMode = nil
                    Task {
                        try? await Task.sleep(for: .milliseconds(350))
                        creating = RecipeDraftSession(draft: draft)
                    }
                }
            }
        }
    }

    /// Opens the editor once the import sheet is gone, or moves on if the
    /// import was cancelled.
    private func reviewSharedDraft() {
        if let draft = sharedDraft {
            sharedDraft = nil
            creating = RecipeDraftSession(draft: draft)
        } else {
            importNextShared()
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
                filterChip("All", .all, symbol: nil)
                filterChip("Favorites", .favorites, symbol: "heart.fill")
                filterChip("Ready to cook", .ready, symbol: "checkmark.circle.fill")
                ForEach(tags, id: \.self) { filterChip($0, .tag($0), symbol: "number") }
            }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
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
            kitchen.delete(recipe)
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
