import SwiftUI

/// Tells the Community tab that saved recipes have newer versions.
struct CommunityUpdatesBanner: View {
    let count: Int

    var body: some View {
        NavigationLink(value: CommunityRoute.updates) {
            HStack(spacing: 12) {
                IconBadge(systemImage: "arrow.triangle.2.circlepath")
                VStack(alignment: .leading, spacing: 2) {
                    Text(count == 1 ? "A saved recipe has an update" : "\(count) saved recipes have updates")
                        .font(.subheadline.weight(.semibold))
                        .multilineTextAlignment(.leading)
                    Text("Their cooks changed them since you saved.").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.brandSoft, in: .rect(cornerRadius: 18))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("communityUpdatesBanner")
    }
}

/// Saved community recipes whose cooks changed them since: take the new
/// version, or keep the saved one.
struct CommunityUpdatesView: View {
    @Environment(CommunityClient.self) private var client
    @State private var working: String?
    @State private var confirming: Community.Update?
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Section { ErrorBanner(message: error) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            Section {
                ForEach(client.pendingUpdates) { update in
                    CommunityUpdateRow(update: update, working: working == update.id,
                                       apply: { confirming = update }, dismiss: { Task { await dismiss(update) } })
                        .disabled(working != nil)
                }
            } footer: {
                if !client.pendingUpdates.isEmpty {
                    Text("Updating replaces the saved recipe's title, description, photo, ingredients and steps. Your notes, favorites and cooking history stay.")
                }
            }
        }
        .overlay {
            if client.pendingUpdates.isEmpty {
                ContentUnavailableView("Everything is up to date", systemImage: "checkmark.circle",
                                       description: Text("When a cook changes a recipe you saved, the new version shows up here."))
            }
        }
        .navigationTitle("Recipe updates")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { _ = try? await client.checkForUpdates() }
        .communityUpdateConfirmation(for: $confirming) { update in Task { await apply(update) } }
    }

    private func apply(_ update: Community.Update) async {
        working = update.id
        defer { working = nil }
        do {
            try await client.applyUpdate(update)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func dismiss(_ update: Community.Update) async {
        working = update.id
        defer { working = nil }
        do {
            try await client.dismissUpdate(update)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct CommunityUpdateRow: View {
    let update: Community.Update
    let working: Bool
    let apply: () -> Void
    let dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(update.title.nilIfEmpty ?? "Saved recipe").font(.headline)
            Text("The cook changed this recipe since you saved it.").font(.subheadline).foregroundStyle(.secondary)
            CommunityUpdateButtons(working: working, apply: apply, dismiss: dismiss)
        }
        .padding(.vertical, 4)
    }
}

/// "Update" and "Not now", side by side or stacked with larger text.
struct CommunityUpdateButtons: View {
    let working: Bool
    let apply: () -> Void
    let dismiss: () -> Void

    var body: some View {
        AdaptiveStack(spacing: 10) {
            Button(action: apply) {
                if working { ProgressView() } else { Label("Update", systemImage: "arrow.down.circle") }
            }
            .buttonStyle(.borderedProminent)
            .accessibilityIdentifier("communityUpdateApply")
            Button("Not now", action: dismiss)
                .buttonStyle(.bordered)
                .accessibilityIdentifier("communityUpdateDismiss")
        }
        .font(.subheadline.weight(.semibold))
        .disabled(working)
    }
}

extension View {
    /// Confirms replacing a saved copy with the community's newer version.
    func communityUpdateConfirmation(for update: Binding<Community.Update?>, onConfirm: @escaping (Community.Update) -> Void) -> some View {
        sheet(item: update) { confirming in
            ConfirmSheet(systemImage: "arrow.triangle.2.circlepath", title: "Update \(confirming.title.nilIfEmpty ?? "this recipe")?",
                         message: "This replaces your saved copy's title, description, photo, ingredients and steps with the cook's latest version. Changes you made to them are lost. Your notes, favorites and cooking history stay.",
                         action: "Replace my copy", tint: .brand, actionIdentifier: "communityUpdateConfirm") {
                onConfirm(confirming)
            }
        }
    }
}

/// On a saved recipe's own page: its community original has a newer version.
struct CommunityUpdateNotice: View {
    let recipe: Recipe
    @Environment(CommunityClient.self) private var client
    @State private var working = false
    @State private var confirming: Community.Update?
    @State private var error: String?

    private var update: Community.Update? {
        client.pendingUpdates.first { $0.recipeId == recipe.uuid.uuidString || (recipe.serverID != nil && $0.recipeId == recipe.serverID) }
    }

    var body: some View {
        if let update {
            VStack(alignment: .leading, spacing: 8) {
                Label("The community recipe was updated", systemImage: "arrow.triangle.2.circlepath")
                    .font(.subheadline.weight(.semibold))
                Text("Its cook changed it since you saved this copy.").font(.footnote).foregroundStyle(.secondary)
                if let error { Text(error).font(.footnote).foregroundStyle(.orange) }
                CommunityUpdateButtons(working: working, apply: { confirming = update }, dismiss: { Task { await run { try await client.dismissUpdate(update) } } })
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.brandSoft, in: .rect(cornerRadius: 18))
            .communityUpdateConfirmation(for: $confirming) { update in Task { await run { try await client.applyUpdate(update) } } }
        }
    }

    private func run(_ action: () async throws -> Void) async {
        working = true
        defer { working = false }
        do {
            try await action()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
