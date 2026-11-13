import AuthenticationServices
import SwiftUI

/// The system Sign in with Apple button. Asks only for the name, which Apple
/// shares on first sign-in; nothing else is collected.
struct CommunitySignInButton: View {
    @Binding var error: String?
    var label: SignInWithAppleButton.Label = .signIn
    var onSignedIn: () -> Void = {}
    @Environment(CommunityAccount.self) private var account
    @Environment(\.colorScheme) private var colorScheme
    @State private var nonce = ""
    @State private var working = false

    var body: some View {
        SignInWithAppleButton(label) { request in
            nonce = AppleNonce.random()
            request.requestedScopes = [.fullName]
            request.nonce = AppleNonce.sha256(nonce)
        } onCompletion: { result in
            switch result {
            case .success(let authorization): Task { await complete(authorization) }
            case .failure(let failure): error = Self.message(for: failure)
            }
        }
        .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
        .frame(height: 50)
        .disabled(working)
        .opacity(working ? 0.5 : 1)
        .overlay { if working { ProgressView() } }
        .accessibilityIdentifier("communitySignIn")
    }

    private func complete(_ authorization: ASAuthorization) async {
        guard let community = CommunityService.communityURL else {
            error = "Add a community address in Settings first."
            return
        }
        working = true
        defer { working = false }
        do {
            try await account.completeSignIn(authorization, rawNonce: nonce, community: community)
            error = nil
            onSignedIn()
        } catch {
            self.error = error.localizedDescription
        }
    }

    static func message(for error: Error) -> String? {
        guard let error = error as? ASAuthorizationError else { return error.localizedDescription }
        switch error.code {
        case .canceled: return nil
        // Unsigned and simulator builds lack the entitlement and fail with .unknown.
        case .unknown, .notHandled: return "Sign in with Apple isn't available right now. Check that you're signed in to your Apple Account in Settings."
        default: return error.localizedDescription
        }
    }
}

/// Settings rows for the community account: who's signed in, their public
/// profile, what they've shared, and signing out or deleting the account.
/// With a connected server the profile belongs to the account connected there.
struct CommunityAccountSection: View {
    @Environment(CommunityAccount.self) private var account
    @Environment(CommunityClient.self) private var client
    @State private var error: String?
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var status: Community.AccountStatus?

    private var viaServer: Bool { client.isAvailable && client.mode == .companion }
    /// Profiles and "my recipes" need a community with API v2; assume so until it says otherwise.
    private var hasProfiles: Bool { client.capabilities.social || !client.capabilities.isKnown }

    var body: some View {
        if viaServer { serverSection }
        Section {
            if let session = account.session {
                LabeledContent {
                    Text(session.name)
                } label: {
                    Label("Signed in with Apple", systemImage: "person.crop.circle.badge.checkmark")
                }
                if !viaServer, client.isSignedIn, hasProfiles {
                    NavigationLink { CommunityProfileEditor() } label: { Label("Profile", systemImage: "person.text.rectangle") }
                        .accessibilityIdentifier("communityProfile")
                    NavigationLink { MySharedRecipesView() } label: { Label("My shared recipes", systemImage: "book.pages") }
                        .accessibilityIdentifier("communityMyRecipes")
                } else {
                    NavigationLink { DisplayNameEditor() } label: { Label("Display name", systemImage: "character.cursor.ibeam") }
                }
                Button { account.signOut() } label: { Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right") }
                Button(role: .destructive) { confirmDelete = true } label: {
                    HStack {
                        Label("Delete community account", systemImage: "trash")
                        if deleting { Spacer(); ProgressView() }
                    }
                }
                .tint(.red)
                .disabled(deleting)
            } else {
                CommunitySignInButton(error: $error)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            }
            if let error { Text(error).font(.footnote).foregroundStyle(.orange) }
        } header: {
            Eyebrow("Community account")
        } footer: {
            Text(account.isSignedIn
                 ? "Recipes, ratings and tips you share show your name. Deleting your account removes it and everything you've shared from the community, and disconnects Sous Chef from your Apple Account."
                 : "Sign in to like recipes, follow cooks, rate what you make and publish your own. Browsing and saving don't need an account.")
        }
        .sheet(isPresented: $confirmDelete) {
            ConfirmSheet(systemImage: "person.crop.circle.badge.xmark", title: "Delete your community account?",
                         message: "Your community account and everything you've shared, including recipes, ratings and tips, will be removed from the community. Recipes in your kitchen stay on this device. This can't be undone.",
                         action: "Delete account and recipes", actionIdentifier: "confirmDeleteAccount") {
                Task { await delete() }
            }
        }
    }

    /// The community account connected to the person's Sous Chef server.
    private var serverSection: some View {
        Section {
            if let status {
                if let me = status.me {
                    LabeledContent {
                        Text(me.cook.name)
                    } label: {
                        Label("Connected on your server", systemImage: "server.rack")
                    }
                    NavigationLink { CommunityProfileEditor() } label: { Label("Profile", systemImage: "person.text.rectangle") }
                    NavigationLink { MySharedRecipesView() } label: { Label("My shared recipes", systemImage: "book.pages") }
                } else if status.connected {
                    Label("Connected on your server", systemImage: "server.rack")
                } else if status.configured {
                    Text("Connect your community account on your server's web app (Community → Connect) to like, follow, rate and publish.")
                        .foregroundStyle(.secondary)
                } else {
                    Text("Your Sous Chef server isn't linked to a recipe community.").foregroundStyle(.secondary)
                }
            } else {
                ProgressView()
            }
        } header: {
            Eyebrow("Through your server")
        }
        .task { status = try? await client.accountStatus() }
    }

    private func delete() async {
        deleting = true
        defer { deleting = false }
        do {
            try await account.deleteAccount()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Optional; Sign in with Apple already supplies the name. For communities
/// without profiles; otherwise `CommunityProfileEditor` edits the name.
struct DisplayNameEditor: View {
    @Environment(CommunityAccount.self) private var account
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var saving = false
    @State private var error: String?

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        Form {
            Section {
                TextField("Display name", text: $name)
                    .textContentType(.name)
                    .onChange(of: name) { _, value in if value.count > 40 { name = String(value.prefix(40)) } }
            } footer: {
                Text("Shown with recipes you publish. Up to 40 characters.")
            }
            if let error { Section { Text(error).foregroundStyle(.orange) } }
        }
        .navigationTitle("Display name")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if saving { ProgressView() } else {
                    Button("Save") { Task { await save() } }
                        .disabled(trimmed.isEmpty || trimmed == account.session?.name)
                }
            }
        }
        .onAppear { name = account.session?.name ?? "" }
    }

    private func save() async {
        saving = true
        defer { saving = false }
        do {
            try await account.rename(trimmed)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
