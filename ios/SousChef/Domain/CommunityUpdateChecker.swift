import Foundation

/// Spaces out checks for newer revisions of saved community recipes.
nonisolated struct CommunityUpdateThrottle: Sendable {
    /// The shortest time between two checks.
    var interval: TimeInterval = 15 * 60
    private(set) var lastCheck: Date?

    /// Whether a check is due at `now`; a yes counts as the check.
    mutating func begin(now: Date = .now) -> Bool {
        if let lastCheck, now >= lastCheck, now.timeIntervalSince(lastCheck) < interval { return false }
        lastCheck = now
        return true
    }

    /// The check failed, so the next one may run right away.
    mutating func failed() {
        lastCheck = nil
    }
}

/// Looks for updates to saved community recipes when Community appears and
/// when the app comes to the foreground, at most once per `throttle.interval`.
/// The results land in `CommunityClient.pendingUpdates`.
final class CommunityUpdateChecker {
    static let shared = CommunityUpdateChecker(client: .shared)

    let client: CommunityClient
    private(set) var throttle = CommunityUpdateThrottle()
    private var checking = false
    /// The server kitchen the last check was for.
    private var household: String?

    init(client: CommunityClient, interval: TimeInterval = 15 * 60) {
        self.client = client
        throttle.interval = interval
    }

    /// Community content stays behind the guidelines agreement, and so do its update notices.
    private var allowed: Bool { client.isAvailable && client.moderation.hasAcceptedGuidelines }

    func checkIfDue(now: Date = .now) async {
        guard allowed, !checking else { return }
        // Another kitchen has its own saved copies: check now.
        if client.householdID != household { throttle.failed() }
        guard throttle.begin(now: now) else { return }
        household = client.householdID
        checking = true
        defer { checking = false }
        do {
            try await client.checkForUpdates()
        } catch {
            throttle.failed()
        }
    }
}

/// How one of the cook's own recipes stands in the community.
nonisolated enum CommunityShareStatus: Equatable, Sendable {
    case removed, underReview, isPublic, unlisted, notShared

    /// Moderation outranks visibility: a removed recipe isn't public whatever it says.
    init(_ listing: Community.Listing) {
        if listing.removed == true {
            self = .removed
        } else if listing.underReview == true {
            self = .underReview
        } else {
            switch listing.visibility {
            case "unlisted": self = .unlisted
            case "private": self = .notShared
            default: self = .isPublic
            }
        }
    }

    var title: String {
        switch self {
        case .removed: "Removed by a moderator"
        case .underReview: "Under review"
        case .isPublic: "Public"
        case .unlisted: "Unlisted"
        case .notShared: "Not shared"
        }
    }

    var systemImage: String {
        switch self {
        case .removed: "xmark.octagon.fill"
        case .underReview: "exclamationmark.triangle.fill"
        case .isPublic: "globe"
        case .unlisted: "link"
        case .notShared: "lock.fill"
        }
    }

    /// Whether other people can open the recipe.
    var isVisible: Bool { self == .isPublic || self == .unlisted }
}
