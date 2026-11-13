import SwiftUI

/// The person's public community profile: display name and bio, with what
/// the community counts for them.
struct CommunityProfileEditor: View {
    static let nameLimit = 40
    static let bioLimit = 160

    @Environment(CommunityClient.self) private var client
    @Environment(CommunityAccount.self) private var account
    @Environment(\.dismiss) private var dismiss
    @State private var me: Community.Me?
    @State private var name = ""
    @State private var bio = ""
    /// A community without profiles: only the name can change.
    @State private var nameOnly = false
    @State private var loadError: String?
    @State private var saving = false
    @State private var error: String?
    /// Which field the community's word filter refused, when it's clear.
    @State private var rejected: Field?

    private enum Field { case name, bio }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedBio: String { bio.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var originalName: String { me?.cook.name ?? account.session?.name ?? "" }
    private var originalBio: String { me?.cook.bio ?? "" }
    private var changed: Bool { trimmedName != originalName || (!nameOnly && trimmedBio != originalBio) }
    private var loaded: Bool { me != nil || nameOnly }

    var body: some View {
        Form {
            if let loadError {
                Section {
                    ErrorBanner(message: loadError)
                    Button("Try again", systemImage: "arrow.clockwise") { Task { await load() } }
                }
            } else if !loaded {
                Section { ProgressView().frame(maxWidth: .infinity) }
            } else {
                Section {
                    TextField("Display name", text: $name)
                        .textContentType(.name)
                        .onChange(of: name) { _, value in
                            if value.count > Self.nameLimit { name = String(value.prefix(Self.nameLimit)) }
                        }
                        .accessibilityIdentifier("profileName")
                    if rejected == .name, let error { Text(error).font(.footnote).foregroundStyle(.red).accessibilityIdentifier("profileError") }
                } header: {
                    Eyebrow("Display name")
                } footer: {
                    Text("Shown with your recipes, ratings and tips. Up to \(Self.nameLimit) characters.")
                }
                if !nameOnly {
                    Section {
                        TextField("A line about how you cook (optional)", text: $bio, axis: .vertical)
                            .lineLimit(2...5)
                            .onChange(of: bio) { _, value in
                                if value.count > Self.bioLimit { bio = String(value.prefix(Self.bioLimit)) }
                            }
                            .accessibilityIdentifier("profileBio")
                        Text("\(bio.count)/\(Self.bioLimit)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(bio.count >= Self.bioLimit ? Color.orange : Color.secondary)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .accessibilityLabel("\(bio.count) of \(Self.bioLimit) characters")
                        if rejected == .bio, let error { Text(error).font(.footnote).foregroundStyle(.red).accessibilityIdentifier("profileError") }
                    } header: {
                        Eyebrow("Bio")
                    } footer: {
                        Text("Shown on your profile.")
                    }
                }
                if rejected == nil, let error {
                    Section { ErrorBanner(message: error).accessibilityIdentifier("profileError") }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                if let cook = me?.cook {
                    Section {
                        LabeledContent("Recipes shared", value: cook.recipeCount.formatted())
                        LabeledContent("Followers", value: cook.followerCount.formatted())
                        LabeledContent("Following", value: cook.followingCount.formatted())
                    } header: {
                        Eyebrow("In the community")
                    }
                }
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if saving {
                    ProgressView()
                } else {
                    Button("Save") { Task { await save() } }
                        .disabled(!loaded || trimmedName.isEmpty || !changed)
                        .accessibilityIdentifier("profileSave")
                }
            }
        }
        .task { await load() }
    }

    private func load() async {
        loadError = nil
        do {
            let loaded = try await client.me()
            me = loaded
            name = loaded.cook.name
            bio = loaded.cook.bio ?? ""
        } catch CommunityError.unsupported {
            nameOnly = true
            name = account.session?.name ?? ""
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func save() async {
        saving = true
        error = nil
        rejected = nil
        defer { saving = false }
        let nameChanged = trimmedName != originalName
        let bioChanged = !nameOnly && trimmedBio != originalBio
        do {
            if nameOnly {
                try await account.rename(trimmedName)
            } else {
                me = try await client.updateProfile(name: nameChanged ? trimmedName : nil, bio: bioChanged ? trimmedBio : nil)
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
            if case .filtered = error as? CommunityError, nameChanged != bioChanged {
                rejected = nameChanged ? .name : .bio
            }
        }
    }
}
