#if DEBUG
import Foundation

/// Debug builds only: signs in to the community without Sign in with Apple,
/// which can't run in the simulator, so UI tests can like, follow and rate.
///
///     -communityTestToken <publisher token>   sign in as that token's cook
///     -resetCommunityState                    forget hidden recipes, blocked cooks, saved copies and the guidelines agreement
///     -communityStaleSaves                    treat recipes saved this launch as one revision behind
///
/// Compiled out of Release builds.
enum CommunityTestSession {
    /// Stands in for the Apple user ID, so the session is recognizable as a test one.
    static let marker = "debug-test-token"

    private static var arguments: [String] { ProcessInfo.processInfo.arguments }

    static var token: String? { UserDefaults.standard.string(forKey: "communityTestToken")?.nilIfEmpty }

    static var isRequested: Bool { token != nil }

    /// Runs before anything reads the community's settings.
    static func resetIfRequested(defaults: UserDefaults = .standard) {
        guard arguments.contains("-resetCommunityState") else { return }
        for key in ["community.guidelinesAccepted", "community.hiddenRecipes", "community.blockedAuthors", CommunitySavedCopies.key] {
            defaults.removeObject(forKey: key)
        }
    }

    /// A test session outlives the launch that made it, in the Keychain. Without
    /// a token this launch is signed out, as the test that follows expects.
    static func removeLeftoverSession(account: CommunityAccount = .shared) {
        if !isRequested, account.session?.appleUserID == marker { account.signOut() }
    }

    /// `-communityStaleSaves`: a copy saved this launch counts as an older
    /// revision, so the update notice and the Updates list can be tried
    /// without the cook changing the recipe.
    static func makeStaleIfRequested(_ recipe: Recipe?, client: CommunityClient) async {
        guard arguments.contains("-communityStaleSaves"), let recipe, let copy = client.copies.copy(for: recipe.uuid) else { return }
        client.copies.record(recipe: recipe.uuid, remoteID: copy.remoteID, revision: copy.revision - 1, origin: copy.origin)
        _ = try? await client.checkForUpdates()
    }

    /// Installs the session for the configured community.
    static func installIfRequested(account: CommunityAccount = .shared) async {
        guard let token, let base = CommunityService.communityURL else { return }
        let transport = DirectCommunityTransport(base: base, session: CommunityClient.defaultSession, token: token)
        guard let data = try? await transport.send(CommunityCalls.me()),
              let me = try? JSONDecoder().decode(Community.Me.self, from: data) else {
            if account.session?.appleUserID == marker { account.signOut() }
            return
        }
        account.save(CommunitySession(token: token, userID: me.id, name: me.cook.name, appleUserID: marker, origin: base.absoluteString))
    }
}
#endif
