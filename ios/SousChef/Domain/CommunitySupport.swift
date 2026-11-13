import Foundation

/// What can go wrong talking to the community, worded for people.
nonisolated enum CommunityError: LocalizedError, Equatable {
    /// Direct mode: the action needs the Sign in with Apple community account, or its sign-in expired.
    case notSignedIn
    /// Companion mode: the server has no community account connected for this person.
    case needsServerConnection
    case rateLimited
    /// The community's word filter refused the text. Carries the server's message.
    case filtered(String)
    /// The request was refused for another reason (400, 413). Carries the server's message.
    case invalid(String)
    /// Not allowed (403), such as a moderator action by someone who isn't one.
    case notAllowed(String)
    /// The recipe, cook or tip is gone or hidden.
    case notFound
    /// This community or server is too old for the feature. See `CommunityClient.capabilities`.
    case unsupported
    /// No community is set up, or it couldn't be reached.
    case unavailable
    /// Anything else the companion server reported, in its words.
    case server(String)

    static let filterMessage = "This text isn't allowed in the community"
    static let connectMessage = "Connect your community account first"

    var errorDescription: String? {
        switch self {
        case .notSignedIn: "Sign in to your community account to do this."
        case .needsServerConnection: "Connect your community account on your Sous Chef server first (Community → Connect on the web app)."
        case .rateLimited: "You're doing that a lot. Wait a moment and try again."
        case .filtered(let message), .invalid(let message), .notAllowed(let message), .server(let message): message
        case .notFound: "This isn't in the community any more."
        case .unsupported: "This needs a newer recipe community. Update your Sous Chef server to use it."
        case .unavailable: "The recipe community couldn't be reached. Try again."
        }
    }

    /// Reads an HTTP error response of the community service.
    static func fromHTTP(status: Int, message: String?) -> CommunityError {
        switch status {
        case 401: return .notSignedIn
        case 429: return .rateLimited
        case 404: return .notFound
        case 403: return .notAllowed(message ?? "You're not allowed to do that.")
        case 400, 413:
            guard let message, !message.isEmpty else { return .invalid("The community couldn't accept that.") }
            return message.localizedCaseInsensitiveContains("isn't allowed in the community") ? .filtered(message) : .invalid(message)
        default: return .unavailable
        }
    }

    /// Reads the message a companion server answered a `community:…` operation with.
    static func fromServer(_ message: String) -> CommunityError {
        let lower = message.lowercased()
        if lower.contains("unknown operation") { return .unsupported }
        if lower.contains("connect your community account") { return .needsServerConnection }
        if lower.contains("isn't allowed in the community") { return .filtered(message) }
        if lower.contains("rate limit") || lower.contains("too many") { return .rateLimited }
        if lower.contains("not found") { return .notFound }
        return .server(message)
    }
}

/// Identifies this install to the community without revealing an ID: the
/// `clientKey` of `/api/v2/save` and `/api/v2/report`.
enum CommunityInstall {
    static let identifierKey = "community.installID"

    /// SHA-256 hex of a random identifier kept on this device and a purpose
    /// label, so the keys for saving and reporting can't be linked.
    static func clientKey(purpose: String, defaults: UserDefaults = .standard) -> String {
        AppleNonce.sha256("sous-chef-ios:\(identifier(defaults)):\(purpose)")
    }

    private static func identifier(_ defaults: UserDefaults) -> String {
        if let existing = defaults.string(forKey: identifierKey), !existing.isEmpty { return existing }
        let created = UUID().uuidString.lowercased()
        defaults.set(created, forKey: identifierKey)
        return created
    }
}

/// Public pages of community recipes: `https://souschefkitchen.app/r/<id>`.
enum CommunityLink {
    static let host = "souschefkitchen.app"

    /// The community recipe ID in a share link, or nil for any other URL.
    static func recipeID(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "https", url.host(percentEncoded: false)?.lowercased() == host,
              url.port == nil || url.port == 443, url.user == nil, url.password == nil else { return nil }
        var parts = url.path(percentEncoded: true).split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        // "/r/abc/" splits into ["", "r", "abc", ""].
        if parts.last == "" { parts.removeLast() }
        guard parts.count == 3, parts[0].isEmpty, parts[1] == "r",
              let id = parts[2].removingPercentEncoding?.nilIfEmpty, !id.contains("/"), id != ".", id != ".." else { return nil }
        return id
    }

    /// The share link for a recipe, for communities whose listings carry no `shareUrl`.
    static func url(forRecipeID id: String) -> URL? {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        guard let encoded = id.addingPercentEncoding(withAllowedCharacters: allowed), !encoded.isEmpty else { return nil }
        return URL(string: "https://\(host)/r/\(encoded)")
    }
}

/// Matches community recipes against the pantry on this device, with the
/// same name normalization cooking uses (`CookingPlanner`).
enum CommunityPantry {
    /// Normalized names of everything in stock.
    static func inStockNames(_ stock: [StockLine]) -> Set<String> {
        Set(stock.filter { $0.quantity > 0.000001 }.map { normalizeName($0.name) }.filter { !$0.isEmpty })
    }

    /// Each distinct ingredient counts once.
    static func match(ingredientNames: [String], inStock: Set<String>) -> Community.PantryMatch {
        var seen = Set<String>()
        var have = 0
        var missing: [String] = []
        for name in ingredientNames {
            let key = normalizeName(name)
            guard !key.isEmpty, seen.insert(key).inserted else { continue }
            if inStock.contains(key) { have += 1 } else { missing.append(name.trimmingCharacters(in: .whitespacesAndNewlines)) }
        }
        return Community.PantryMatch(have: have, total: seen.count, missing: missing)
    }

    /// "Cook from your pantry": the largest share of ingredients on hand
    /// first, then the most ingredients on hand; ties keep their order.
    /// Listings without a match go last.
    static func ordered(_ listings: [Community.Listing]) -> [Community.Listing] {
        listings.enumerated().sorted { left, right in
            let (a, b) = (left.element.pantry, right.element.pantry)
            let (shareA, shareB) = (a?.share ?? -1, b?.share ?? -1)
            if shareA != shareB { return shareA > shareB }
            if (a?.have ?? 0) != (b?.have ?? 0) { return (a?.have ?? 0) > (b?.have ?? 0) }
            return left.offset < right.offset
        }.map(\.element)
    }
}

/// Where a saved community recipe came from, so the app can offer its updates.
nonisolated struct SavedCommunityCopy: Codable, Equatable, Sendable {
    var remoteID: String
    /// The revision the saved recipe matches.
    var revision: Int
    /// The community it came from (`CommunityService.originKey`).
    var origin: String
    /// A newer revision the person chose not to take.
    var dismissedRevision: Int?
}

/// Saved copies made without a companion server, kept on this device only
/// (UserDefaults): local recipe UUID → community recipe. Nothing here is
/// synced, so another device doesn't offer updates for the same recipe.
final class CommunitySavedCopies {
    static let key = "community.savedCopies"

    private let defaults: UserDefaults
    private(set) var copies: [UUID: SavedCommunityCopy]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let stored = defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode([String: SavedCommunityCopy].self, from: $0) } ?? [:]
        copies = Dictionary(stored.compactMap { key, value in UUID(uuidString: key).map { ($0, value) } }, uniquingKeysWith: { first, _ in first })
    }

    func copy(for recipe: UUID) -> SavedCommunityCopy? { copies[recipe] }

    /// The saved recipe for a community recipe, when this device saved one.
    func recipe(forRemoteID remoteID: String, origin: String) -> UUID? {
        copies.first { $0.value.remoteID == remoteID && $0.value.origin == origin }?.key
    }

    /// Remembers a save, or that the copy now matches `revision`.
    func record(recipe: UUID, remoteID: String, revision: Int, origin: String) {
        copies[recipe] = SavedCommunityCopy(remoteID: remoteID, revision: revision, origin: origin, dismissedRevision: nil)
        persist()
    }

    /// Stops offering `revision`; a later one is offered again.
    func dismiss(recipe: UUID, revision: Int) {
        guard copies[recipe] != nil else { return }
        copies[recipe]?.dismissedRevision = revision
        persist()
    }

    func forget(recipe: UUID) {
        guard copies.removeValue(forKey: recipe) != nil else { return }
        persist()
    }

    /// Forgets copies whose recipe no longer exists.
    func prune(keeping existing: Set<UUID>) {
        let kept = copies.filter { existing.contains($0.key) }
        guard kept.count != copies.count else { return }
        copies = kept
        persist()
    }

    private func persist() {
        let stored = Dictionary(copies.map { ($0.key.uuidString, $0.value) }, uniquingKeysWith: { first, _ in first })
        defaults.set(try? JSONEncoder().encode(stored), forKey: Self.key)
    }
}

extension CommunityService {
    /// A community address in the form saved copies and sessions are compared
    /// by: scheme, host and port, plus any path, without a trailing slash.
    static func originKey(_ url: URL) -> String {
        var text = url.absoluteString
        while text.hasSuffix("/") { text.removeLast() }
        guard let scheme = url.scheme, let host = url.host(percentEncoded: false),
              let range = text.range(of: "\(scheme)://\(host)", options: [.caseInsensitive, .anchored]) else { return text }
        return text.replacingCharacters(in: range, with: "\(scheme.lowercased())://\(host.lowercased())")
    }

    static func originKey(_ address: String) -> String? {
        URL(string: address).map(originKey)
    }
}

// MARK: Moderation for v2 types

extension CommunityModeration {
    /// Prefers the stable cook ID; falls back to the display name.
    static func key(for author: Community.Author) -> String {
        key(for: DTO.CommunityRecipe.Author(id: author.id, name: author.name))
    }

    func isBlocked(_ author: Community.Author) -> Bool {
        blockedAuthors[Self.key(for: author)] != nil
    }

    /// Hidden, from a blocked cook, or caught by the on-device word filter.
    func isHidden(_ listing: Community.Listing) -> Bool {
        hiddenRecipes[listing.id] != nil || isBlocked(listing.author) || ContentFilter.isObjectionable(listing)
    }

    func isHidden(_ detail: Community.Detail) -> Bool {
        isHidden(detail.listing) || ContentFilter.isObjectionable(detail.snapshot)
    }

    /// Reported by the person, from a blocked cook or caught by the on-device word filter.
    func isHidden(_ tip: Community.Tip) -> Bool {
        reportedTips.contains(tip.id) || isBlocked(tip.author) || ContentFilter.isObjectionable([tip.author.name, tip.tip ?? ""].joined(separator: "\n"))
    }

    func visible(_ listings: [Community.Listing]) -> [Community.Listing] {
        listings.filter { !isHidden($0) }
    }

    func visible(_ tips: [Community.Tip]) -> [Community.Tip] {
        tips.filter { !isHidden($0) }
    }

    /// Hides or shows a recipe on this device. `CommunityClient.setHidden` also tells a companion server.
    func setHidden(_ hidden: Bool, recipeID: String, title: String) {
        if hidden {
            hide(DTO.CommunityRecipe(id: recipeID, title: title, description: nil, tags: nil, servings: nil, totalTimeMinutes: nil, sourceUrl: nil,
                                     photoUrl: nil, photoDataUrl: nil, ingredients: [], steps: [], author: nil, createdAt: nil))
        } else {
            unhide(id: recipeID)
        }
    }

    /// Blocks or unblocks a cook on this device. `CommunityClient.setBlocked` also tells a companion server.
    func setBlocked(_ blocked: Bool, author: Community.Author) {
        let legacy = DTO.CommunityRecipe.Author(id: author.id, name: author.name)
        if blocked { block(legacy) } else { unblock(key: Self.key(for: legacy)) }
    }
}

extension ContentFilter {
    static func isObjectionable(_ listing: Community.Listing) -> Bool {
        isObjectionable(([listing.title, listing.description ?? "", listing.author.name] + listing.tags + listing.ingredientNames).joined(separator: "\n"))
    }

    static func isObjectionable(_ snapshot: Community.Snapshot) -> Bool {
        var fields = [snapshot.title, snapshot.description ?? ""] + snapshot.tags
        fields += snapshot.ingredients.flatMap { [$0.name, $0.note ?? ""] }
        fields += snapshot.steps.map(\.text)
        return isObjectionable(fields.joined(separator: "\n"))
    }
}
