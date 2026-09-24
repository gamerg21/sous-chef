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
    @State private var path = NavigationPath()

    enum Filter: Hashable {
        case all, favorites, ready, tag(String)
    }

    private var tags: [String] {
        Array(Set(recipes.flatMap(\.tags))).sorted().prefix(20).map { $0 }
    }

    private var plans: [UUID: CookingPlan] {
        let stock = pantry.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
        return Dictionary(uniqueKeysWithValues: recipes.map { ($0.uuid, CookingPlanner.plan(ingredients: $0.ingredients, stock: stock)) })
    }

    private func visible(_ plans: [UUID: CookingPlan]) -> [Recipe] {
        recipes.filter { recipe in
            let matchesSearch = search.isEmpty || recipe.title.localizedStandardContains(search)
                || recipe.tags.contains { $0.localizedStandardContains(search) }
                || recipe.ingredients.contains { $0.name.localizedStandardContains(search) }
            let matchesFilter = switch filter {
            case .all: true
            case .favorites: recipe.favorited
            case .ready: plans[recipe.uuid]?.missingIngredients.isEmpty == true && !recipe.ingredients.isEmpty
            case .tag(let tag): recipe.tags.contains(tag)
            }
            return matchesSearch && matchesFilter
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            let plans = plans
            let shown = visible(plans)
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
            .navigationDestination(for: Recipe.self) { RecipeDetailView(recipe: $0) }
            .toolbar {
                SettingsToolbarButton(showSettings: $showSettings)
                ToolbarItem(placement: .topBarTrailing) { addMenu }
            }
            .refreshable { await kitchen.server.syncNow() }
            .sheet(item: $creating) { session in
                RecipeEditorView(draft: session.draft, recipe: nil) { saved in
                    path.append(saved)
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
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip("All", .all, symbol: nil)
                filterChip("Favorites", .favorites, symbol: "heart.fill")
                filterChip("Ready to cook", .ready, symbol: "checkmark.circle.fill")
                ForEach(tags, id: \.self) { filterChip($0, .tag($0), symbol: "number") }
            }
        }
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
            Button { importMode = .link } label: { Label("Import from a link", systemImage: "link") }.buttonStyle(.glassProminent)
            Button { importMode = .photo } label: { Label("Scan a cookbook page", systemImage: "doc.text.viewfinder") }.buttonStyle(.glass)
            Button { importMode = .ideas } label: { Label("Recipe ideas", systemImage: "apple.intelligence") }.buttonStyle(.glass)
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
                    ReadinessBadge(plan: plan, total: recipe.ingredients.count)
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
    let plan: CookingPlan?
    let total: Int

    var body: some View {
        if let plan, total > 0 {
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
