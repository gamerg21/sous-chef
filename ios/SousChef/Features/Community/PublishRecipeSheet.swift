import SwiftUI

/// With a connected server, publishing runs through the server's community
/// connection. Otherwise it goes straight to the community with the person's
/// Sign in with Apple account.
struct PublishRecipeSheet: View {
    let recipe: Recipe
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityModeration.self) private var moderation
    @Environment(CommunityAccount.self) private var account
    @Environment(\.dismiss) private var dismiss
    @State private var state: (configured: Bool, connected: Bool)?
    @State private var visibility = "public"
    @State private var working = false
    @State private var error: String?
    @State private var signInError: String?
    @State private var outcome: Outcome?

    private enum Outcome { case published, removed }

    private var viaServer: Bool { kitchen.server.isConnected }

    private var canPublish: Bool {
        guard moderation.hasAcceptedGuidelines else { return false }
        if viaServer { return state?.configured == true && state?.connected == true }
        return CommunityService.isConfigured && account.session != nil
    }

    private var isPublished: Bool { viaServer || account.publicationID(for: recipe) != nil }

    var body: some View {
        // Another device may delete the recipe while this is open.
        DeletedElsewhereGuard(recipe) { screen }
    }

    private var screen: some View {
        NavigationStack {
            Group {
                if let outcome { success(outcome) } else { form }
            }
            .navigationTitle("Share with the community")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", role: .close) { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                if outcome == nil && canPublish {
                    Button { Task { await publish() } } label: {
                        Group {
                            if working { ProgressView().tint(.white) } else {
                                Label(account.publicationID(for: recipe) == nil ? "Publish recipe" : "Update recipe", systemImage: "paperplane.fill")
                                    .font(.headline)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(working)
                    .padding()
                    .accessibilityIdentifier("publishRecipe")
                }
            }
            .task {
                guard viaServer else { return }
                struct Connection: Decodable { let configured: Bool; let connected: Bool }
                if let result = try? await kitchen.server.client?.call("community:connection", as: Connection.self) {
                    state = (result.configured, result.connected)
                } else {
                    state = (false, false)
                }
            }
        }
        .presentationDetents([.large])
        // Opaque, so the recipe underneath doesn't show through the text.
        .presentationBackground(Color(.systemGroupedBackground))
        .animation(.snappy, value: outcome)
    }

    private var form: some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    RecipeImage(data: recipe.photo)
                        .frame(width: 64, height: 64)
                        .clipShape(.rect(cornerRadius: 14, style: .continuous))
                    VStack(alignment: .leading, spacing: 4) {
                        Text(recipe.title).font(.headline).lineLimit(2)
                        Text("\(recipe.ingredients.count) ingredients · \(recipe.steps.count) steps")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            if !moderation.hasAcceptedGuidelines {
                Section {
                    CommunityGuidelinesCard()
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            } else if viaServer {
                if let state {
                    if !state.configured {
                        Text("Your Sous Chef server isn't linked to a recipe community. Set COMMUNITY_API_URL on the server to enable it.")
                    } else if !state.connected {
                        Text("Connect your community account on the web app (Community → Connect), then come back to publish.")
                    } else {
                        publishOptions(author: nil)
                    }
                } else {
                    ProgressView()
                }
            } else if !CommunityService.isConfigured {
                Text("Add a community address in Settings to publish recipes.")
            } else if let session = account.session {
                publishOptions(author: session.name)
            } else {
                Section {
                    CommunitySignInButton(error: $signInError)
                        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    if let signInError { Text(signInError).font(.footnote).foregroundStyle(.orange) }
                } header: {
                    Eyebrow("Community account")
                } footer: {
                    Text("Sign in to publish recipes. Browsing doesn't need an account.")
                }
            }
            if let error {
                Section { ErrorBanner(message: error) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
        }
    }

    @ViewBuilder
    private func publishOptions(author: String?) -> some View {
        Section {
            Picker("Visibility", selection: $visibility) {
                Text("Public").tag("public")
                Text("Unlisted").tag("unlisted")
            }
            .pickerStyle(.segmented)
        } header: {
            Eyebrow("Who can see it")
        } footer: {
            Text(visibility == "public" ? "Anyone can find it in Community." : "Only people with the link can open it. It won't appear in Community.")
        }
        Section {
            if let author { Label("Published as \(author)", systemImage: "person.crop.circle") }
            Label("Shares the title, photo, ingredients and steps. Private notes and pantry links stay in your kitchen.", systemImage: "lock")
                .font(.callout)
                .foregroundStyle(.secondary)
            Text("Everything you publish must follow the [community guidelines](https://souschefkitchen.app/community-guidelines/).")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        if isPublished {
            Section {
                Button(role: .destructive) { Task { await unpublish() } } label: {
                    Label("Remove from the community", systemImage: "eye.slash")
                }
                .disabled(working)
            }
        }
    }

    private func success(_ outcome: Outcome) -> some View {
        VStack(spacing: 18) {
            Spacer()
            Image(systemName: outcome == .published ? "checkmark.circle.fill" : "eye.slash.circle.fill")
                .font(.system(size: 72))
                .foregroundStyle(outcome == .published ? Color.brand : .secondary)
                .symbolEffect(.bounce, options: .nonRepeating)
            Text(outcome == .published ? "Published to the community" : "Removed from the community")
                .font(.title2.weight(.bold))
                .multilineTextAlignment(.center)
            Text(outcome == .published
                 ? (visibility == "public" ? "\(recipe.title) is live. Anyone can find it in Community." : "\(recipe.title) is live for anyone with the link.")
                 : "\(recipe.title) no longer appears in Community. Copies people already saved stay with them.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Spacer()
            Button { dismiss() } label: {
                Text("Done").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.glassProminent)
        }
        .padding(28)
        .scrollsWhenTall()
        .sensoryFeedback(.success, trigger: outcome)
    }

    private func publish() async {
        guard moderation.hasAcceptedGuidelines else { return }
        working = true
        error = nil
        defer { working = false }
        do {
            if viaServer {
                await kitchen.server.syncNow()
                guard let id = recipe.serverID, let client = kitchen.server.client else {
                    error = "Sync this recipe to your server first."
                    return
                }
                _ = try await client.call("community:publishRecipe", ["recipeId": id, "visibility": visibility])
            } else {
                try await account.publish(recipe, visibility: visibility)
            }
            outcome = .published
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func unpublish() async {
        working = true
        error = nil
        defer { working = false }
        do {
            if viaServer {
                guard let id = recipe.serverID, let client = kitchen.server.client else { return }
                _ = try await client.call("community:unpublishRecipe", ["recipeId": id])
            } else {
                try await account.unpublish(recipe)
            }
            outcome = .removed
        } catch {
            self.error = error.localizedDescription
        }
    }
}
