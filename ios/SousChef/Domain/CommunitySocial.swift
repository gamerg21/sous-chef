import Foundation
import Observation

/// What the person did in the community this session, shared by every screen
/// that shows it: likes, follows and saves. A like on a card shows on the
/// recipe's page and the other way round. Changes show at once and roll back
/// when the community refuses them.
@Observable
final class CommunitySocial {
    static let shared = CommunitySocial(client: .shared)

    struct LikeState: Equatable {
        var liked: Bool
        var count: Int
    }

    struct FollowState: Equatable {
        var following: Bool
        /// Nil until a cook's profile or a follow reported it.
        var followers: Int?
    }

    /// Why a social action can't go ahead yet.
    enum AccountPrompt: String, Identifiable {
        /// Direct mode: sign in with Apple.
        case signIn
        /// Companion mode: the community account is connected on the server's web app.
        case connectOnServer

        var id: String { rawValue }
    }

    let client: CommunityClient

    private(set) var likes: [String: LikeState] = [:]
    private(set) var follows: [String: FollowState] = [:]
    /// Companion mode: community recipes saved since their listing was loaded,
    /// until the server answers for them again (`reconcileSaved`).
    private(set) var saved: Set<String> = []
    /// Companion mode: whether the server has a community account connected, once asked.
    private(set) var status: Community.AccountStatus?

    /// Set to ask the person to sign in or connect; the Community tab presents it.
    var prompt: AccountPrompt?
    /// A short message for the Community tab to show, such as a failed like.
    var notice: String?

    @ObservationIgnored private var pendingLikes = Set<String>()
    @ObservationIgnored private var pendingFollows = Set<String>()

    init(client: CommunityClient) {
        self.client = client
    }

    // MARK: Account

    /// The prompt to show before a social action, or nil when the person can act.
    /// In companion mode the answer is known only after `refreshStatus()`;
    /// until then actions go ahead and the server's refusal brings the prompt.
    var accountPrompt: AccountPrompt? {
        switch client.mode {
        case .direct: client.isSignedIn ? nil : .signIn
        case .companion: status?.connected == false ? .connectOnServer : nil
        }
    }

    /// The signed-in cook's ID, when known.
    var myID: String? {
        switch client.mode {
        case .direct: client.isSignedIn ? client.account.session?.userID : nil
        case .companion: status?.me?.id
        }
    }

    /// Changes when the person signs in, out, or switches community, server or the server kitchen on screen.
    var identity: String {
        "\(client.mode == .direct ? "direct" : "companion"):\(myID ?? "")" + (client.householdID.map { "@\($0)" } ?? "")
    }

    /// Asks for the account when a social action needs one. Returns whether the action can go ahead.
    func requireAccount() -> Bool {
        guard let needed = accountPrompt else { return true }
        prompt = needed
        return false
    }

    static func prompt(for error: any Error) -> AccountPrompt? {
        switch error as? CommunityError {
        case .notSignedIn: .signIn
        case .needsServerConnection: .connectOnServer
        default: nil
        }
    }

    /// Shows the sign-in prompt for an account error, or the error's message for any other.
    func report(_ error: any Error) {
        if error is CancellationError { return }
        if let needed = Self.prompt(for: error) {
            if needed == .connectOnServer { status = Community.AccountStatus(configured: status?.configured ?? true, connected: false, me: nil) }
            prompt = needed
        } else {
            notice = error.localizedDescription
        }
    }

    /// Companion mode: asks the server whether a community account is connected.
    func refreshStatus() async {
        guard client.isAvailable, client.mode == .companion else {
            if status != nil { status = nil }
            return
        }
        if let fresh = try? await client.accountStatus(), fresh != status { status = fresh }
    }

    /// Forgets likes, follows and saves, such as after signing in as someone else or switching kitchens.
    func reset() {
        likes = [:]
        follows = [:]
        saved = []
    }

    // MARK: Likes

    func like(for listing: Community.Listing) -> LikeState {
        likes[listing.id] ?? LikeState(liked: listing.liked ?? false, count: listing.likeCount)
    }

    /// Fresh listings from the community replace what was remembered, except likes still being sent.
    func reconcile(_ listings: [Community.Listing]) {
        for listing in listings where likes[listing.id] != nil && !pendingLikes.contains(listing.id) && listing.liked != nil {
            likes[listing.id] = nil
        }
    }

    /// Likes or unlikes at once, and puts it back if the community refuses.
    /// Taps while one is being sent are ignored. Throws `CommunityError`.
    func toggleLike(_ listing: Community.Listing) async throws {
        let id = listing.id
        guard pendingLikes.insert(id).inserted else { return }
        defer { pendingLikes.remove(id) }
        let before = like(for: listing)
        let wanted = !before.liked
        likes[id] = LikeState(liked: wanted, count: max(0, before.count + (wanted ? 1 : -1)))
        do {
            let result = try await client.like(recipeID: id, liked: wanted)
            likes[id] = LikeState(liked: result.liked, count: result.likeCount)
        } catch {
            likes[id] = before
            throw error
        }
    }

    // MARK: Follows

    func follow(for cookID: String, following: Bool, followers: Int? = nil) -> FollowState {
        guard let known = follows[cookID] else { return FollowState(following: following, followers: followers) }
        return FollowState(following: known.following, followers: known.followers ?? followers)
    }

    /// A cook's profile just loaded: it knows best.
    func reconcile(_ cook: Community.Cook) {
        guard !pendingFollows.contains(cook.id), let viewer = cook.viewer else { return }
        follows[cook.id] = FollowState(following: viewer.following, followers: cook.followerCount)
    }

    /// Follows or unfollows at once, and puts it back if the community refuses. Throws `CommunityError`.
    func toggleFollow(cookID: String, current: FollowState) async throws {
        guard pendingFollows.insert(cookID).inserted else { return }
        defer { pendingFollows.remove(cookID) }
        let wanted = !current.following
        follows[cookID] = FollowState(following: wanted, followers: current.followers.map { max(0, $0 + (wanted ? 1 : -1)) })
        do {
            let result = try await client.follow(userID: cookID, following: wanted)
            follows[cookID] = FollowState(following: result.following, followers: result.followerCount)
        } catch {
            follows[cookID] = current
            throw error
        }
    }

    // MARK: Saves

    /// Whether the kitchen has a copy. Without a server the copy on this
    /// device says, so deleting it lets the recipe be saved again; with one,
    /// the server's answer in the listing does, or a save made since.
    func isSaved(_ listing: Community.Listing) -> Bool {
        if client.mode == .direct { return client.savedRecipe(forRemoteID: listing.id) != nil }
        return listing.saved == true || saved.contains(listing.id)
    }

    /// Listings just read from the server know whether their copy still exists; what was remembered gives way.
    func reconcileSaved(_ listings: [Community.Listing]) {
        for listing in listings where listing.saved != nil && saved.contains(listing.id) {
            saved.remove(listing.id)
        }
    }

    func markSaved(_ recipeID: String) {
        saved.insert(recipeID)
    }
}
