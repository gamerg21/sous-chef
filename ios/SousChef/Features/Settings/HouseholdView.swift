import SwiftUI

/// Sharing the kitchen with the people you live with, through iCloud.
struct HouseholdView: View {
    @Environment(Kitchen.self) private var kitchen
    @State private var confirmStop = false
    @State private var confirmLeave = false
    @State private var removing: HouseholdPerson?

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
        .sheet(isPresented: $confirmStop) {
            ConfirmSheet(systemImage: "person.2.slash", title: "Stop sharing your kitchen?",
                         message: "Everyone you invited loses access right away and keeps nothing from it. Your kitchen stays on your devices and in your iCloud.",
                         action: "Stop sharing", actionIdentifier: "householdConfirmStop") {
                Task { await sharing.stopSharing() }
            }
        }
        .sheet(isPresented: $confirmLeave) {
            ConfirmSheet(systemImage: "rectangle.portrait.and.arrow.right", title: "Leave \(ownerKitchen)?",
                         message: "You'll go back to your own kitchen, as it was before you joined. What you added here stays with \(ownerKitchen).",
                         action: "Leave household", actionIdentifier: "householdConfirmLeave") {
                Task { await sharing.leaveFromSettings() }
            }
        }
        .sheet(item: $removing) { person in
            ConfirmSheet(systemImage: "person.badge.minus", title: removeTitle(for: person), message: removeMessage(for: person),
                         action: person.status == .invited ? "Cancel invitation" : "Remove", cancel: "Keep",
                         actionIdentifier: "householdConfirmRemove") {
                Task { await sharing.remove(person) }
            }
        }
    }

    private func removeTitle(for person: HouseholdPerson) -> String {
        let name = HouseholdText.firstName(person.name)
        return person.status == .invited ? "Cancel \(HouseholdText.possessive(name)) invitation?" : "Remove \(name)?"
    }

    private func removeMessage(for person: HouseholdPerson) -> String {
        let name = HouseholdText.firstName(person.name)
        let what = person.status == .invited
            ? "The link you sent \(name) stops working."
            : "\(name) loses access to your kitchen right away. Their phone goes back to their own kitchen and keeps nothing from yours."
        let last = sharing.people.filter { $0.role == .member }.count == 1
        return last ? what + " No one else is in your kitchen, so it stops being shared." : what
    }

    private func pickContact() {
        InviteContactPicker.present { addresses, name in
            Task { await sharing.invite(addresses, name: name) }
        }
    }

    private var ownerKitchen: String {
        sharing.ownerName.map { "\(HouseholdText.possessive($0)) kitchen" } ?? "this kitchen"
    }

    // MARK: Owner

    @ViewBuilder private var ownerSections: some View {
        if sharing.isSharing {
            peopleSection
        }
        Section {
            Button(action: pickContact) {
                HStack {
                    Label(sharing.isSharing ? "Invite someone else" : "Invite someone", systemImage: "person.badge.plus")
                    if sharing.working { Spacer(); ProgressView() }
                }
            }
            .accessibilityIdentifier("householdInvite")
        } header: {
            if !sharing.isSharing { Eyebrow("Share your kitchen") }
        } footer: {
            if sharing.isSharing {
                Text("They get a link in Messages that opens only for their Apple Account.")
            } else {
                Text("Invite the people you cook with. Everyone sees and edits the same pantry, recipes, shopping list and plan. Pick someone from Contacts and they get a link in Messages that opens only for their Apple Account. Each person needs an iPhone, iPad or Mac. It all stays in iCloud, with no server.")
            }
        }
        .disabled(sharing.working)
        if sharing.isSharing {
            Section {
                Button(role: .destructive) { confirmStop = true } label: {
                    Label("Stop sharing", systemImage: "person.2.slash")
                }
                .disabled(sharing.working)
                .accessibilityIdentifier("householdStopSharing")
            }
        }
    }

    // MARK: Member

    @ViewBuilder private var memberSections: some View {
        Section {
            Label {
                Text(sharing.ownerName == nil ? "You're in a shared kitchen" : "You're in \(ownerKitchen)").font(.body.weight(.semibold))
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
                let manageable = !kitchen.cloud.isHouseholdMember && person.role == .member
                LabeledContent {
                    if manageable, person.status == .invited, person.address != nil {
                        Button("Resend") { sharing.resend(to: person) }
                            .buttonStyle(.borderless)
                            .accessibilityIdentifier("householdResend")
                    } else {
                        Text(HouseholdText.badge(for: person)).foregroundStyle(.secondary)
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(person.name)
                        if person.status == .invited {
                            Text(["Waiting to join", person.detail].compactMap { $0 }.joined(separator: " · "))
                                .font(.footnote).foregroundStyle(.secondary)
                        } else if let detail = person.detail {
                            Text(detail).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                .swipeActions {
                    if manageable {
                        Button(person.status == .invited ? "Cancel" : "Remove", role: .destructive) { removing = person }
                            .tint(.red)
                    }
                }
                .contextMenu {
                    if manageable {
                        if person.status == .invited, person.address != nil {
                            Button { sharing.resend(to: person) } label: { Label("Resend invitation", systemImage: "message") }
                        }
                        Button(role: .destructive) { removing = person } label: {
                            Label(person.status == .invited ? "Cancel invitation" : "Remove from kitchen", systemImage: "person.badge.minus")
                        }
                    }
                }
            }
        } header: {
            Eyebrow("People")
        } footer: {
            if !kitchen.cloud.isHouseholdMember, sharing.people.contains(where: { $0.role == .member }) {
                Text("Swipe someone to remove them or cancel their invitation.")
            }
        }
    }
}
