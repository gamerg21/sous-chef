import SwiftUI

/// Asks how to join a kitchen someone shared, after tapping their invitation.
struct JoinHouseholdSheet: View {
    let invitation: HouseholdInvitation
    @Environment(Kitchen.self) private var kitchen

    private var sharing: HouseholdSharing { .shared }
    private var blocked: Bool { kitchen.server.isConnected || !kitchen.iCloudAvailable }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 10) {
                        IconBadge(systemImage: "house.fill", size: 64)
                        Text("\(invitation.ownerName) invited you to their kitchen")
                            .font(.title3.weight(.bold))
                            .multilineTextAlignment(.center)
                        Text(invitation.title).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                } footer: {
                    Text("Everyone in a kitchen sees and edits the same pantry, recipes, shopping list and plan.")
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                }

                if let current = invitation.currentOwnerName {
                    Section {
                        Label("Joining leaves \(HouseholdText.possessive(current)) kitchen.", systemImage: "arrow.uturn.left")
                    }
                }
                if !kitchen.iCloudAvailable {
                    Section { Text("Households aren't available in this build.").foregroundStyle(.orange) }
                } else if kitchen.server.isConnected {
                    Section { Text(HouseholdError.serverConnected.errorDescription ?? "").foregroundStyle(.orange) }
                }

                Section {
                    Button { join(mergeLocal: true) } label: {
                        choice("Bring my kitchen along", detail: "Adds your pantry, recipes, shopping list and plan to theirs.", systemImage: "arrow.triangle.merge")
                    }
                    .accessibilityIdentifier("joinMerge")
                    Button { join(mergeLocal: false) } label: {
                        choice("Start fresh with theirs", detail: "Your own kitchen stays saved in your iCloud and comes back if you leave.", systemImage: "sparkles")
                    }
                    .accessibilityIdentifier("joinFresh")
                } header: {
                    Eyebrow("Your kitchen")
                }
                .disabled(blocked || sharing.joining)

                if sharing.joining {
                    Section {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Joining \(HouseholdText.possessive(invitation.ownerName)) kitchen…").foregroundStyle(.secondary)
                        }
                    }
                }
                if let error = sharing.joinError {
                    Section { Text(error).foregroundStyle(.orange) }
                }
            }
            .navigationTitle("Join kitchen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { sharing.cancelInvitation() }
                        .disabled(sharing.joining)
                        .accessibilityIdentifier("joinCancel")
                }
            }
            // Cancel is the only way out, so the invitation is always cleared.
            .interactiveDismissDisabled()
        }
    }

    private func choice(_ title: String, detail: String, systemImage: String) -> some View {
        HStack(spacing: 14) {
            IconBadge(systemImage: systemImage)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold)).foregroundStyle(.primary)
                Text(detail).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func join(mergeLocal: Bool) {
        Task { await sharing.join(invitation, mergeLocal: mergeLocal) }
    }
}

/// The join sheet and household alerts, shown over the whole app.
private struct HouseholdPresentations: ViewModifier {
    @Environment(Kitchen.self) private var kitchen
    @Binding var showSettings: Bool
    /// False while onboarding covers the app; invitations wait until it's done.
    let ready: Bool
    @State private var presented: HouseholdInvitation?

    func body(content: Content) -> some View {
        let sharing = HouseholdSharing.shared
        content
            .sheet(item: $presented) { invitation in
                JoinHouseholdSheet(invitation: invitation)
                    .kitchenEnvironment(kitchen)
            }
            .onChange(of: sharing.pendingInvitation?.id, initial: true) { present() }
            .onChange(of: ready) { present() }
            .alert("Back to your own kitchen", isPresented: Binding(
                get: { kitchen.cloud.householdEndedNotice != nil },
                set: { if !$0 { kitchen.cloud.householdEndedNotice = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(kitchen.cloud.householdEndedNotice ?? "")
            }
            .alert("Household", isPresented: Binding(
                get: { sharing.notice != nil },
                set: { if !$0 { sharing.notice = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(sharing.notice ?? "")
            }
    }

    private func present() {
        guard ready, let invitation = HouseholdSharing.shared.pendingInvitation else {
            presented = nil
            return
        }
        guard presented?.id != invitation.id else { return }
        // Only one sheet shows at a time, so Settings steps aside first.
        if showSettings {
            showSettings = false
            Task {
                try? await Task.sleep(for: .milliseconds(700))
                presented = HouseholdSharing.shared.pendingInvitation
            }
        } else {
            presented = invitation
        }
    }
}

extension View {
    func householdPresentations(showSettings: Binding<Bool>, ready: Bool) -> some View {
        modifier(HouseholdPresentations(showSettings: showSettings, ready: ready))
    }
}
