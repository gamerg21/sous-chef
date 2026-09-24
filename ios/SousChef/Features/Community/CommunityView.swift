import SwiftUI

struct CommunityView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @State private var recipes: [DTO.CommunityRecipe] = []
    @State private var search = ""
    @State private var loading = false
    @State private var error: String?
    @State private var loaded = false

    private var available: Bool { kitchen.server.isConnected || CommunityService.isConfigured }

    var body: some View {
        NavigationStack {
            Group {
                if !available {
                    ContentUnavailableView {
                        Label("Join the recipe community", systemImage: "person.2")
                    } description: {
                        Text("Browse and share recipes with other Sous Chef cooks. Connect your Sous Chef server in Settings, or add a community address.")
                    } actions: {
                        Button("Open Settings") { showSettings = true }.buttonStyle(.glassProminent)
                    }
                } else if loading && recipes.isEmpty {
                    ProgressView("Loading community recipes…")
                } else if let error, recipes.isEmpty {
                    ContentUnavailableView("Community unavailable", systemImage: "wifi.exclamationmark", description: Text(error))
                } else if recipes.isEmpty && loaded {
                    ContentUnavailableView(search.isEmpty ? "No recipes yet" : "No matches", systemImage: "book.pages",
                                           description: Text(search.isEmpty ? "Be the first to publish a recipe from its page." : "Try another search."))
                } else {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 14)], spacing: 14) {
                            ForEach(recipes) { recipe in
                                NavigationLink(value: recipe) { CommunityCard(recipe: recipe) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Community")
            .navigationDestination(for: DTO.CommunityRecipe.self) { CommunityRecipeView(recipe: $0) }
            .searchable(text: $search, prompt: "Search community recipes")
            .onSubmit(of: .search) { Task { await load() } }
            .toolbar { SettingsToolbarButton(showSettings: $showSettings) }
            .refreshable { await load() }
            .task(id: available) { await load() }
            .onChange(of: search) { _, value in if value.isEmpty { Task { await load() } } }
        }
    }

    private func load() async {
        guard available else { return }
        loading = true
        defer { loading = false; loaded = true }
        do {
            recipes = try await CommunityService.list(search: search, server: kitchen.server)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

extension DTO.CommunityRecipe {
    var imageData: Data? {
        guard let url = photoDataUrl ?? photoUrl, url.hasPrefix("data:"), let comma = url.firstIndex(of: ",") else { return nil }
        return Data(base64Encoded: String(url[url.index(after: comma)...]))
    }
}

struct CommunityCard: View {
    let recipe: DTO.CommunityRecipe

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            RecipeImage(data: recipe.imageData)
                .frame(height: 120)
                .frame(maxWidth: .infinity)
                .clipped()
            VStack(alignment: .leading, spacing: 4) {
                Text(recipe.title).font(.subheadline.weight(.semibold)).lineLimit(2, reservesSpace: true)
                if let author = recipe.author?.name {
                    Label(author, systemImage: "person.crop.circle").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .padding(10)
        }
        .background(.background.secondary)
        .clipShape(.rect(cornerRadius: 20, style: .continuous))
    }
}

struct CommunityRecipeView: View {
    let recipe: DTO.CommunityRecipe
    @Environment(Kitchen.self) private var kitchen
    @State private var saving = false
    @State private var saved = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                RecipeImage(data: recipe.imageData)
                    .frame(height: 240)
                    .frame(maxWidth: .infinity)
                    .clipShape(.rect(cornerRadius: 24, style: .continuous))
                Text(recipe.title).heroTitle()
                if let author = recipe.author?.name { Label("Shared by \(author)", systemImage: "person.crop.circle").foregroundStyle(.secondary) }
                if let description = recipe.description { Text(description) }
                HStack {
                    if let minutes = recipe.totalTimeMinutes { Chip(text: "\(Int(minutes)) min", systemImage: "timer") }
                    if let servings = recipe.servings { Chip(text: "\(Int(servings)) servings", systemImage: "person.2") }
                }
                Card {
                    Eyebrow("Ingredients", systemImage: "list.bullet")
                    ForEach(Array(recipe.ingredients.enumerated()), id: \.offset) { _, ingredient in
                        HStack {
                            Text(ingredient.name)
                            Spacer()
                            Text(Units.amount(ingredient.quantity, ingredient.unit)).foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    Eyebrow("Steps", systemImage: "list.number")
                    ForEach(Array(recipe.steps.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top) {
                            Text("\(index + 1).").bold().foregroundStyle(Color.brand)
                            Text(step.text)
                        }
                    }
                }
                if let error { ErrorBanner(message: error) }
            }
            .padding()
            .padding(.bottom, 80)
        }
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            Button {
                Task { await save() }
            } label: {
                Group {
                    if saving { ProgressView() } else { Label(saved ? "Saved to your recipes" : "Save to my recipes", systemImage: saved ? "checkmark" : "square.and.arrow.down") }
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)
            .disabled(saving || saved)
            .padding()
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        // Through a server, the server records where the recipe came from.
        if let client = kitchen.server.client, kitchen.server.isConnected {
            do {
                _ = try await client.call("community:saveRecipe", ["recipeId": recipe.id])
                await kitchen.server.syncNow()
                saved = true
                return
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
        var draft = RecipeDraft(title: recipe.title)
        draft.summary = recipe.description
        draft.tags = recipe.tags ?? []
        draft.servings = recipe.servings.map { Int($0) }
        draft.totalTimeMinutes = recipe.totalTimeMinutes.map { Int($0) }
        draft.sourceURL = recipe.sourceUrl
        draft.ingredients = recipe.ingredients.map { Ingredient(name: $0.name, quantity: $0.quantity, unit: $0.unit, note: $0.note) }
        draft.steps = recipe.steps.map { RecipeStep(text: $0.text) }
        draft.photo = recipe.imageData
        let saved = kitchen.save(draft)
        saved.communityAuthor = recipe.author?.name
        kitchen.changed()
        self.saved = true
    }
}

/// Publishing runs through the connected server, which holds the community account.
struct PublishRecipeSheet: View {
    let recipe: Recipe
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var state: (configured: Bool, connected: Bool)?
    @State private var visibility = "public"
    @State private var working = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            Form {
                if let state {
                    if !state.configured {
                        Text("Your Sous Chef server isn't linked to a recipe community. Set COMMUNITY_API_URL on the server to enable it.")
                    } else if !state.connected {
                        Text("Connect your community account on the web app (Community → Connect), then come back to publish.")
                    } else {
                        Section {
                            Picker("Visibility", selection: $visibility) {
                                Text("Public").tag("public")
                                Text("Unlisted").tag("unlisted")
                            }
                            .pickerStyle(.segmented)
                        } footer: {
                            Text("Publishing shares the title, photo, ingredients and steps. Private notes and pantry links stay in your kitchen.")
                        }
                        Section {
                            Button("Publish \(recipe.title)") { Task { await publish() } }
                                .disabled(working)
                            Button("Unpublish", role: .destructive) { Task { await unpublish() } }
                                .disabled(working)
                        }
                    }
                } else {
                    ProgressView()
                }
                if let message { Text(message).foregroundStyle(.secondary) }
            }
            .navigationTitle("Share with the community")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", role: .close) { dismiss() } } }
            .task {
                struct Connection: Decodable { let configured: Bool; let connected: Bool }
                if let result = try? await kitchen.server.client?.call("community:connection", as: Connection.self) {
                    state = (result.configured, result.connected)
                } else {
                    state = (false, false)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func publish() async {
        working = true
        defer { working = false }
        await kitchen.server.syncNow()
        guard let id = recipe.serverID, let client = kitchen.server.client else {
            message = "Sync this recipe to your server first."
            return
        }
        do {
            _ = try await client.call("community:publishRecipe", ["recipeId": id, "visibility": visibility])
            message = "Published."
        } catch {
            message = error.localizedDescription
        }
    }

    private func unpublish() async {
        working = true
        defer { working = false }
        guard let id = recipe.serverID, let client = kitchen.server.client else { return }
        do {
            _ = try await client.call("community:unpublishRecipe", ["recipeId": id])
            message = "Removed from the community."
        } catch {
            message = error.localizedDescription
        }
    }
}
