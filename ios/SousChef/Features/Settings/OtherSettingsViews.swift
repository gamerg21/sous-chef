import SwiftUI

/// Notification, alarm and Live Activity permissions, and expiry reminders.
struct NotificationSettingsView: View {
    var body: some View {
        Form {
            AlertPermissionsSection()
            ExpiryReminderSection()
        }
        .navigationTitle("Notifications and Timers")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Apple Intelligence and Open Food Facts: the features that reach beyond
/// the kitchen on this device.
struct IntelligenceSettingsView: View {
    @Environment(Kitchen.self) private var kitchen
    @State private var offEnabled = OpenFoodFacts.enabled

    var body: some View {
        @Bindable var ai = kitchen.ai
        Form {
            Section {
                LabeledContent("In use") { AIEngineBadge() }
                LabeledContent("On-device model", value: ai.onDeviceStatus)
                LabeledContent("Private Cloud Compute", value: ai.privateCloudStatus)
                if ai.privateCloudEnabled {
                    Toggle("Prefer Private Cloud Compute", isOn: $ai.preferPrivateCloud)
                }
            } header: {
                Eyebrow("Apple Intelligence")
            } footer: {
                Text("Recipe ideas, label reading, recipe reading and aisle sorting use Apple's on-device model. Where available, Private Cloud Compute runs Apple's larger model on Apple silicon servers that don't keep your data. With a server connected and no Apple Intelligence, Sous Chef uses the AI provider set up on your server.")
            }

            Section {
                Toggle(isOn: $offEnabled) { Label("Open Food Facts lookups", systemImage: "barcode") }
                    .onChange(of: offEnabled) { _, value in OpenFoodFacts.enabled = value }
            } header: {
                Eyebrow("Barcode lookups")
            } footer: {
                Text("Barcode lookups send only the barcode to Open Food Facts.")
            }
        }
        .navigationTitle("Intelligence and Lookups")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The community account, which community to use, and moderation.
struct CommunitySettingsView: View {
    @Environment(CommunityModeration.self) private var moderation
    @Environment(CommunityAccount.self) private var account
    @State private var communityURL = CommunityService.directURL

    var body: some View {
        Form {
            CommunityAccountSection()

            Section {
                NavigationLink { CommunityModerationSettingsView() } label: {
                    Label("Blocked cooks and hidden recipes", systemImage: "hand.raised")
                }
                .badge(moderation.blockedAuthors.count + moderation.hiddenRecipes.count)
                Link(destination: CommunityModeration.guidelinesURL) { Label("Community guidelines", systemImage: "person.2") }
                Link(destination: URL(string: "mailto:\(CommunityModeration.contactEmail)")!) {
                    LabeledContent { Text(CommunityModeration.contactEmail) } label: { Label("Contact", systemImage: "envelope") }
                }
            } header: {
                Eyebrow("Safety")
            } footer: {
                Text("Report a recipe or block a cook from the recipe's menu. Reports are reviewed within 24 hours, and offending recipes and cooks are removed.")
            }

            Section {
                TextField("Custom community address (optional)", text: $communityURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit(saveCommunityURL)
            } header: {
                Eyebrow("Community address")
            } footer: {
                Text("Leave this empty to use the Sous Chef recipe community; a connected server uses its own.")
            }
        }
        .navigationTitle("Community")
        .navigationBarTitleDisplayMode(.inline)
        // Leaving the page counts as finishing the address, like pressing return.
        .onDisappear(perform: saveCommunityURL)
    }

    private func saveCommunityURL() {
        let address = communityURL.trimmingCharacters(in: .whitespaces)
        guard address != CommunityService.directURL else { return }
        CommunityService.directURL = address
        // A community account belongs to one community.
        if let session = account.session, session.origin != CommunityService.communityURL?.absoluteString { account.signOut() }
    }
}
