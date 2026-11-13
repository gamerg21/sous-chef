import SwiftUI

/// The Community tab: the guidelines gate, then the feed.
struct CommunityView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityModeration.self) private var moderation
    @Environment(CommunityClient.self) private var client
    @Environment(CommunitySocial.self) private var social
    @Environment(\.scenePhase) private var scenePhase
    @Bindable private var navigator = AppNavigator.shared
    @State private var model = CommunityFeedModel()
    @State private var path: [CommunityRoute] = []

    private var ready: Bool { moderation.hasAcceptedGuidelines && client.isAvailable }

    var body: some View {
        @Bindable var social = social
        NavigationStack(path: $path) {
            Group {
                if !moderation.hasAcceptedGuidelines {
                    ScrollView {
                        CommunityGuidelinesCard().padding()
                    }
                } else if !client.isAvailable {
                    ContentUnavailableView {
                        Label("Join the recipe community", systemImage: "person.2")
                    } description: {
                        Text("Browse and share recipes with other Sous Chef cooks. Connect your Sous Chef server in Settings, or add a community address.")
                    } actions: {
                        Button("Open Settings") { showSettings = true }.buttonStyle(.glassProminent)
                    }
                } else {
                    CommunityFeedView(model: model)
                }
            }
            .navigationTitle("Community")
            .communityDestinations()
            .searchable(text: $model.search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search community recipes")
            .onSubmit(of: .search) { model.submitSearch(model.search) }
            .toolbar { SettingsToolbarButton(showSettings: $showSettings) }
        }
        .task(id: UpdatesKey(ready: ready, household: client.householdID)) { await checkForUpdates() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await checkForUpdates() } }
        }
        // A share link waits behind the guidelines, then opens.
        .task(id: LinkKey(id: navigator.communityRecipeToOpen, accepted: moderation.hasAcceptedGuidelines)) { openLinkedRecipe() }
        .sheet(item: $social.prompt) { prompt in
            CommunityAccountPromptSheet(prompt: prompt).kitchenEnvironment(kitchen)
        }
        .overlay(alignment: .top) { CommunityNoticeBar() }
    }

    /// Switching the server kitchen looks for that kitchen's updates.
    private struct UpdatesKey: Hashable {
        var ready: Bool
        var household: String?
    }

    private struct LinkKey: Hashable {
        var id: String?
        var accepted: Bool
    }

    private func checkForUpdates() async {
        guard ready else { return }
        await CommunityUpdateChecker.shared.checkIfDue()
    }

    private func openLinkedRecipe() {
        guard moderation.hasAcceptedGuidelines, let id = navigator.communityRecipeToOpen else { return }
        navigator.communityRecipeToOpen = nil
        if case .recipeID(id) = path.last { return }
        if case .recipe(let listing) = path.last, listing.id == id { return }
        path.append(.recipeID(id))
    }
}

/// A short message that drops in at the top of the Community tab, then leaves.
struct CommunityNoticeBar: View {
    @Environment(CommunitySocial.self) private var social
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if let notice = social.notice {
                Text(notice)
                    .font(.callout.weight(.medium))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .glassEffect(.regular, in: .rect(cornerRadius: 20))
                    .padding(.horizontal)
                    .padding(.top, 8)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                    .accessibilityIdentifier("communityNotice")
            }
        }
        .animation(.snappy, value: social.notice)
        .task(id: social.notice) {
            guard let notice = social.notice else { return }
            AccessibilityNotification.Announcement(notice).post()
            try? await Task.sleep(for: .seconds(3.5))
            if !Task.isCancelled { social.notice = nil }
        }
    }
}
