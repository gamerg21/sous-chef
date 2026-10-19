import CloudKit
import SwiftUI

/// Sharing the kitchen with the people you live with, through iCloud.
struct HouseholdView: View {
    @Environment(Kitchen.self) private var kitchen
    @State private var confirmStop = false
    @State private var confirmLeave = false

    private var sharing: HouseholdSharing { .shared }

    var body: some View {
        Form {
            if !kitchen.iCloudAvailable {
                Section {
                    LabeledContent("Status", value: "Not available in this build")
                } footer: {
                    Text("Households need iCloud, which this build of Sous Chef can't use.")
                }
            } else if kitchen.server.isConnected {
                Section {
                    Label("Your Sous Chef server is connected", systemImage: "server.rack")
                    NavigationLink { SyncSettingsView() } label: { Text("Open Sync and Storage") }
                } footer: {
                    Text("Households use iCloud, so they're off while a companion server is connected. Disconnect the server first. Your server has its own households for sharing.")
                }
            } else if !kitchen.usesICloud {
                Section {
                    Button { kitchen.setICloud(true) } label: { Label("Turn on iCloud", systemImage: "icloud") }
                        .accessibilityIdentifier("householdTurnOnICloud")
                } footer: {
                    Text("Households keep everyone's kitchen in sync through iCloud. Turn on iCloud sync to share your kitchen or join someone else's.")
                }
            } else if kitchen.cloud.isHouseholdMember {
                memberSections
            } else {
                ownerSections
            }

            if let error = sharing.error {
                Section { Text(error).foregroundStyle(.orange) }
            }
        }
        .navigationTitle("Household")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: kitchen.cloud.isHouseholdMember) { await sharing.refresh() }
        .refreshable { await sharing.refresh() }
        .confirmationDialog("Stop sharing your kitchen?", isPresented: $confirmStop, titleVisibility: .visible) {
            Button("Stop sharing", role: .destructive) { Task { await sharing.stopSharing() } }
                .accessibilityIdentifier("householdConfirmStop")
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Everyone you invited loses access right away and keeps nothing from it. Your kitchen stays on your devices and in your iCloud.")
        }
        .confirmationDialog("Leave \(ownerKitchen)?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave household", role: .destructive) { Task { await sharing.leaveFromSettings() } }
                .accessibilityIdentifier("householdConfirmLeave")
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You'll go back to your own kitchen, as it was before you joined. What you added here stays with \(ownerKitchen).")
        }
    }

    private var ownerKitchen: String {
        sharing.ownerName.map { "\(HouseholdText.possessive($0)) kitchen" } ?? "this kitchen"
    }

    // MARK: Owner

    /// The invite button keeps its place whether or not the kitchen is shared
    /// yet, so the share sheet stays open while the share is created.
    @ViewBuilder private var ownerSections: some View {
        if sharing.isSharing {
            peopleSection
        }
        Section {
            ShareLink(item: KitchenInvitation(share: sharing.share),
                      preview: SharePreview(sharing.share?[CKShare.SystemFieldKey.title] as? String ?? "Sous Chef Kitchen", image: Image("Logo"))) {
                Label(sharing.isSharing ? "Invite someone else" : "Invite to kitchen", systemImage: "person.badge.plus")
            }
            .accessibilityIdentifier("householdInvite")
            .disabled(sharing.working || (sharing.isSharing && sharing.share == nil))
        } header: {
            if !sharing.isSharing { Eyebrow("Share your kitchen") }
        } footer: {
            if sharing.isSharing {
                Text("Invitations go to one person at a time, by Messages, Mail or a link.")
            } else {
                Text("Invite the people you cook with. Everyone sees and edits the same pantry, recipes, shopping list and plan. Each person needs an iPhone, iPad or Mac and their own Apple Account. It all stays in iCloud, with no server.")
            }
        }
        if sharing.isSharing {
            Section {
                Button { sharing.managePeople() } label: { Label("Manage people", systemImage: "person.2") }
                    .disabled(sharing.share == nil)
                    .accessibilityIdentifier("householdManage")
                Button(role: .destructive) { confirmStop = true } label: {
                    HStack {
                        Label("Stop sharing", systemImage: "person.2.slash")
                        if sharing.working { Spacer(); ProgressView() }
                    }
                }
                .disabled(sharing.working)
                .accessibilityIdentifier("householdStopSharing")
            } footer: {
                Text("Manage people to remove someone or resend an invitation.")
            }
        }
    }

    // MARK: Member

    @ViewBuilder private var memberSections: some View {
        Section {
            Label {
                Text("You're in \(ownerKitchen)").font(.body.weight(.semibold))
            } icon: {
                Image(systemName: "house.fill").foregroundStyle(Color.brand)
            }
        } footer: {
            Text("Everyone here sees and edits the same pantry, recipes, shopping list and plan. Your own kitchen is saved in your iCloud for when you leave.")
        }
        peopleSection
        Section {
            Button(role: .destructive) { confirmLeave = true } label: {
                HStack {
                    Label("Leave household", systemImage: "rectangle.portrait.and.arrow.right")
                    if sharing.working { Spacer(); ProgressView() }
                }
            }
            .disabled(sharing.working)
            .accessibilityIdentifier("householdLeave")
        }
    }

    // MARK: People

    private var peopleSection: some View {
        Section {
            if sharing.people.isEmpty {
                HStack {
                    Text(sharing.loading ? "Loading…" : "No one yet").foregroundStyle(.secondary)
                    if sharing.loading { Spacer(); ProgressView() }
                }
            }
            ForEach(sharing.people) { person in
                LabeledContent {
                    Text(HouseholdText.badge(for: person)).foregroundStyle(.secondary)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(person.name)
                        if let detail = person.detail { Text(detail).font(.footnote).foregroundStyle(.secondary) }
                    }
                }
            }
        } header: {
            Eyebrow("People")
        }
    }
}
