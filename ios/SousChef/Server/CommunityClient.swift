import Foundation
import Observation
import SwiftData

/// Runs kitchen operations on a Sous Chef server: `ServerClient` in the app, a fake in tests.
protocol KitchenCalling: AnyObject {
    var baseURL: URL { get }
    func call(_ path: String, _ args: [String: Any]) async throws -> Any
}

extension ServerClient: KitchenCalling {}

/// One community request, described for both transports: the v2 HTTP
/// endpoint and the local kitchen operation that wraps it.
struct CommunityCall {
    enum Auth {
        /// Never sends the publisher token.
        case none
        /// Sends the token when signed in.
        case optional
        /// Fails with `CommunityError.notSignedIn` without a token.
        case required
    }

    var method = "POST"
    /// Path segments after the community's address; each is percent-encoded.
    var path: [String]
    var query: [URLQueryItem] = []
    var body: [String: Any] = [:]
    var auth = Auth.none
    /// The kitchen operation, e.g. `community:feed`.
    var operation: String
    var arguments: [String: Any] = [:]

    /// Drops nil values, which both APIs treat as "not given".
    static func compact(_ values: [String: Any?]) -> [String: Any] {
        values.compactMapValues { $0 }
    }
}

/// Carries a `CommunityCall` and returns the JSON it answers with. Throws `CommunityError`.
protocol CommunityTransport {
    func send(_ call: CommunityCall) async throws -> Data
}

/// Talks to the community service itself over HTTPS.
struct DirectCommunityTransport: CommunityTransport {
    /// Enough for a v1 list, which inlines photos up to 6 MB in total.
    static let responseLimit = 16_000_000

    let base: URL
    let session: URLSession
    /// The publisher token of the account that belongs to `base`, when signed in.
    let token: String?

    func url(for call: CommunityCall) throws -> URL {
        guard var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else { throw CommunityError.unavailable }
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        var path = components.percentEncodedPath
        while path.hasSuffix("/") { path.removeLast() }
        components.percentEncodedPath = path + "/" + call.path.map { $0.addingPercentEncoding(withAllowedCharacters: allowed) ?? $0 }.joined(separator: "/")
        if !call.query.isEmpty {
            components.queryItems = call.query
            // URLComponents leaves "+" alone, which servers read as a space.
            components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        }
        guard let url = components.url else { throw CommunityError.unavailable }
        return url
    }

    func request(for call: CommunityCall) throws -> URLRequest {
        var request = URLRequest(url: try url(for: call), timeoutInterval: 30)
        request.httpMethod = call.method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if call.method != "GET" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: call.body)
        }
        if call.auth != .none, let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    func send(_ call: CommunityCall) async throws -> Data {
        if call.auth == .required && token == nil { throw CommunityError.notSignedIn }
        let request = try request(for: call)
        let data: Data
        let response: HTTPURLResponse
        do {
            // The token never follows a redirect off the community.
            (data, response) = try await BoundedFetch.data(for: request, limit: Self.responseLimit, redirects: .sameOriginOnly, session: session)
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch {
            throw CommunityError.unavailable
        }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw CommunityError.fromHTTP(status: response.statusCode, message: message)
        }
        return data
    }
}

/// Goes through the connected Sous Chef server, which holds the community connection.
struct CompanionCommunityTransport: CommunityTransport {
    let server: any KitchenCalling

    func send(_ call: CommunityCall) async throws -> Data {
        do {
            let value = try await server.call(call.operation, call.arguments)
            return try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])
        } catch let error as ServerClient.ServerError {
            switch error {
            case .server(let message): throw CommunityError.fromServer(message)
            case .unreachable, .badResponse: throw Task.isCancelled ? CancellationError() : CommunityError.unavailable
            default: throw CommunityError.server(error.localizedDescription)
            }
        } catch let error as CommunityError {
            throw error
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw CommunityError.unavailable
        }
    }
}

/// Every request of the contract, in both shapes.
enum CommunityCalls {
    private static let v2 = ["api", "v2"]

    private static func item(_ name: String, _ value: String?) -> URLQueryItem? {
        value.flatMap { $0.isEmpty ? nil : URLQueryItem(name: name, value: $0) }
    }

    static func feed(_ query: Community.FeedQuery, cursor: String? = nil, pantry: Bool = false) -> CommunityCall {
        let limit = min(50, max(1, query.limit))
        let search = query.search?.trimmingCharacters(in: .whitespacesAndNewlines)
        let items = [item("sort", query.sort.rawValue), item("tag", query.tag), item("search", search), item("author", query.author),
                     item("cursor", cursor), item("limit", String(limit))].compactMap { $0 }
        var arguments = CommunityCall.compact(["sort": query.sort.rawValue, "tag": query.tag?.nilIfEmpty, "search": search?.nilIfEmpty,
                                               "author": query.author?.nilIfEmpty, "cursor": cursor, "limit": limit])
        if pantry { arguments["pantry"] = true }
        return CommunityCall(method: "GET", path: v2 + ["recipes"], query: items, auth: .optional, operation: "community:feed", arguments: arguments)
    }

    static func followingFeed(cursor: String?, limit: Int) -> CommunityCall {
        let body = CommunityCall.compact(["cursor": cursor, "limit": min(50, max(1, limit))])
        return CommunityCall(path: v2 + ["feed", "following"], body: body, auth: .required, operation: "community:followingFeed", arguments: body)
    }

    static func detail(_ id: String, inlinePhoto: Bool) -> CommunityCall {
        CommunityCall(method: "GET", path: v2 + ["recipes", id], query: inlinePhoto ? [URLQueryItem(name: "photo", value: "inline")] : [],
                      auth: .optional, operation: "community:recipe", arguments: ["id": id])
    }

    static func tips(_ id: String, cursor: String?, limit: Int) -> CommunityCall {
        CommunityCall(method: "GET", path: v2 + ["recipes", id, "tips"],
                      query: [item("cursor", cursor), item("limit", String(min(50, max(1, limit))))].compactMap { $0 },
                      operation: "community:tips", arguments: CommunityCall.compact(["id": id, "cursor": cursor]))
    }

    static func revisions(_ ids: [String]) -> CommunityCall {
        CommunityCall(method: "GET", path: v2 + ["revisions"], query: [URLQueryItem(name: "ids", value: ids.joined(separator: ","))], operation: "community:updates")
    }

    static func tags() -> CommunityCall {
        CommunityCall(method: "GET", path: v2 + ["tags"], operation: "community:tags")
    }

    static func cook(_ id: String) -> CommunityCall {
        CommunityCall(method: "GET", path: v2 + ["cooks", id], auth: .optional, operation: "community:cook", arguments: ["id": id])
    }

    static func me() -> CommunityCall {
        CommunityCall(path: v2 + ["me"], auth: .required, operation: "community:me")
    }

    static func updateProfile(name: String?, bio: String?) -> CommunityCall {
        let body = CommunityCall.compact(["name": name, "bio": bio])
        return CommunityCall(path: v2 + ["me", "profile"], body: body, auth: .required, operation: "community:updateProfile", arguments: body)
    }

    static func myRecipes(cursor: String?) -> CommunityCall {
        let body = CommunityCall.compact(["cursor": cursor])
        return CommunityCall(path: v2 + ["me", "recipes"], body: body, auth: .required, operation: "community:myRecipes", arguments: body)
    }

    static func like(_ id: String, liked: Bool) -> CommunityCall {
        let body: [String: Any] = ["id": id, "liked": liked]
        return CommunityCall(path: v2 + ["like"], body: body, auth: .required, operation: "community:like", arguments: body)
    }

    static func made(_ id: String, rating: Int, tip: String?) -> CommunityCall {
        let body = CommunityCall.compact(["id": id, "rating": rating, "tip": tip?.nilIfEmpty])
        return CommunityCall(path: v2 + ["made"], body: body, auth: .required, operation: "community:made", arguments: body)
    }

    static func removeMade(_ id: String) -> CommunityCall {
        CommunityCall(path: v2 + ["made", "delete"], body: ["id": id], auth: .required, operation: "community:removeMade", arguments: ["id": id])
    }

    static func follow(_ userID: String, following: Bool) -> CommunityCall {
        let body: [String: Any] = ["userId": userID, "following": following]
        return CommunityCall(path: v2 + ["follow"], body: body, auth: .required, operation: "community:follow", arguments: body)
    }

    /// Direct only: a companion server counts the save in `community:saveRecipe`.
    static func save(_ id: String, clientKey: String) -> CommunityCall {
        CommunityCall(path: v2 + ["save"], body: ["id": id, "clientKey": clientKey], operation: "community:saveRecipe", arguments: ["recipeId": id])
    }

    static func report(recipeID: String, tipID: String?, reason: Community.ReportReason, note: String?, clientKey: String) -> CommunityCall {
        let arguments = CommunityCall.compact(["recipeId": recipeID, "tipId": tipID, "reason": reason.rawValue, "note": note?.nilIfEmpty])
        var body = arguments
        body["clientKey"] = clientKey
        return CommunityCall(path: v2 + ["report"], body: body, auth: .optional, operation: "community:report", arguments: arguments)
    }

    static func modReports(status: Community.ReportStatus, cursor: String?) -> CommunityCall {
        let body = CommunityCall.compact(["status": status.rawValue, "cursor": cursor])
        return CommunityCall(path: v2 + ["mod", "reports"], body: body, auth: .required, operation: "community:modReports", arguments: body)
    }

    static func modResolve(reportID: String, action: Community.ModAction, reason: String?) -> CommunityCall {
        let body = CommunityCall.compact(["reportId": reportID, "action": action.rawValue, "reason": reason?.nilIfEmpty])
        return CommunityCall(path: v2 + ["mod", "resolve"], body: body, auth: .required, operation: "community:modResolve", arguments: body)
    }

    // Companion only.

    static func hide(kind: String, key: String, label: String, hidden: Bool) -> CommunityCall {
        CommunityCall(path: [], operation: "community:hide", arguments: ["kind": kind, "key": key, "label": label, "hidden": hidden])
    }

    static func local(_ operation: String, _ arguments: [String: Any] = [:]) -> CommunityCall {
        CommunityCall(path: [], operation: operation, arguments: arguments)
    }

    // From before v2.

    static func legacyList(search: String) -> CommunityCall {
        CommunityCall(method: "GET", path: ["api", "v1", "recipes"], query: [URLQueryItem(name: "search", value: search), URLQueryItem(name: "limit", value: "50")],
                      operation: "community:listRecipes", arguments: ["search": search, "limit": 50])
    }

    static func legacyDetail(_ id: String) -> CommunityCall {
        CommunityCall(method: "GET", path: ["api", "v1", "recipes", id], operation: "community:getRecipe", arguments: ["id": id])
    }
}

/// The recipe community, for screens: one set of methods whether the app
/// talks to the community itself (**direct**, with the Sign in with Apple
/// account) or through a connected Sous Chef server (**companion**). All
/// methods throw `CommunityError`.
///
/// Communities and servers from before API v2 only support browsing and
/// saving. The client finds that out on the first request and falls back;
/// read `capabilities` to hide what isn't there.
@Observable
final class CommunityClient {
    static let shared = CommunityClient(kitchen: .shared)

    enum Mode: Equatable {
        case direct, companion
    }

    enum APILevel: Equatable {
        /// Not asked yet. The first request, or `resolveCapabilities()`, settles it.
        case unknown
        case v2
        /// Before v2: search and save only.
        case legacy
    }

    struct Capabilities: Equatable {
        var mode: Mode
        var level: APILevel

        /// False until the first request settled what the community supports.
        var isKnown: Bool { level != .unknown }
        /// Likes, "made it" ratings and tips, follows and the following feed,
        /// cook profiles, profile editing, "my recipes" and moderator tools.
        var social: Bool { level == .v2 }
        /// Sorting, tags, browsing by cook and paging. Without it a feed is one page that only searches.
        var browsing: Bool { level == .v2 }
        /// Reports go to the community. Without it `report` answers `.useEmail`.
        var reporting: Bool { level == .v2 }
        /// Update notices for saved copies.
        var updates: Bool { level == .v2 }
    }

    /// Hidden recipes and blocked cooks, as `hidden()` lists them.
    struct HiddenList: Equatable {
        struct Entry: Decodable, Equatable, Identifiable {
            var key: String
            var label: String
            var id: String { key }
        }
        var recipes: [Entry]
        var authors: [Entry]
    }

    static let defaultSession = URLSession(configuration: BoundedFetch.anonymousConfiguration)

    let kitchen: Kitchen
    let account: CommunityAccount
    let moderation: CommunityModeration
    /// Saved copies made in direct mode.
    let copies: CommunitySavedCopies

    /// What the community in use supports.
    private(set) var level = APILevel.unknown
    /// Saved copies with a newer revision, as of the last `checkForUpdates()`.
    /// Empty after the server kitchen on screen changes, until the next check.
    var pendingUpdates: [Community.Update] { updatesHousehold == householdID ? updates : [] }
    private var updates: [Community.Update] = []

    @ObservationIgnored private let session: URLSession
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let communityURL: () -> URL?
    @ObservationIgnored private let companion: () -> (any KitchenCalling)?
    @ObservationIgnored private let sync: () async -> Void
    @ObservationIgnored private let household: () -> String?
    /// The server kitchen `updates` were read for.
    @ObservationIgnored private var updatesHousehold: String?
    /// The transport `level` was learned from.
    @ObservationIgnored private var levelKey: String?
    /// A connected server that said it has no community set up; the app then browses directly, as before.
    @ObservationIgnored private var bypassedServer: String?

    /// - Parameters:
    ///   - session: For direct requests. Tests pass one with a stubbed `URLProtocol`.
    ///   - communityURL: The direct community; defaults to `CommunityService.communityURL`.
    ///   - companion: The connected server, or nil; defaults to `kitchen.server` when it's connected.
    ///   - sync: Brings server changes to the device after a companion save; defaults to `kitchen.server.syncNow()`.
    ///   - household: The server kitchen the app shows; defaults to `kitchen.server.householdID`.
    init(kitchen: Kitchen, account: CommunityAccount = .shared, moderation: CommunityModeration = .shared,
         session: URLSession = CommunityClient.defaultSession, defaults: UserDefaults = .standard,
         communityURL: (() -> URL?)? = nil, companion: (() -> (any KitchenCalling)?)? = nil, sync: (() async -> Void)? = nil,
         household: (() -> String?)? = nil) {
        self.kitchen = kitchen
        self.account = account
        self.moderation = moderation
        self.session = session
        self.defaults = defaults
        copies = CommunitySavedCopies(defaults: defaults)
        self.communityURL = communityURL ?? { CommunityService.communityURL }
        self.companion = companion ?? { [weak kitchen] in
            guard let server = kitchen?.server, server.isConnected else { return nil }
            return server.client
        }
        self.sync = sync ?? { [weak kitchen] in await kitchen?.server.syncNow() }
        self.household = household ?? { [weak kitchen] in kitchen?.server.householdID }
    }

    // MARK: Transport

    private var connectedServer: (any KitchenCalling)? {
        guard let server = companion(), bypassedServer != server.baseURL.absoluteString else { return nil }
        return server
    }

    /// Companion whenever a server is connected, as everywhere else in the app.
    var mode: Mode { connectedServer == nil ? .direct : .companion }

    var capabilities: Capabilities { Capabilities(mode: mode, level: level) }

    /// Companion mode: the server's ID of the kitchen the app shows. The app
    /// can show another kitchen than the one the server has as the account's
    /// current, so requests that depend on the kitchen name it.
    var householdID: String? { connectedServer == nil ? nil : household()?.nilIfEmpty }

    /// Names the kitchen on screen in a kitchen operation, so saved state, the
    /// pantry match and update notices come from it. Only for a server known
    /// to be 1.3.0: older ones refuse arguments they don't know, so a server
    /// not asked yet is asked what it supports first.
    private func scoped(_ call: CommunityCall) async -> CommunityCall {
        guard householdID != nil else { return call }
        if level == .unknown { try? await resolveCapabilities() }
        guard level == .v2, let householdID else { return call }
        var call = call
        call.arguments["householdId"] = householdID
        return call
    }

    /// Whether there is a community to talk to at all.
    var isAvailable: Bool { connectedServer != nil || communityURL() != nil }

    /// The direct community's address in the form saved copies and sessions use.
    private var origin: String? { communityURL().map { CommunityService.originKey($0) } }

    /// The signed-in account's token, only for the community it belongs to.
    private func token(for base: URL) -> String? {
        guard let session = account.session, CommunityService.originKey(session.origin) == CommunityService.originKey(base) else { return nil }
        return session.token
    }

    /// Whether the Sign in with Apple account can be used with the direct community.
    var isSignedIn: Bool { communityURL().flatMap(token(for:)) != nil }

    private func transport() throws -> any CommunityTransport {
        let transport: any CommunityTransport
        let key: String
        if let server = connectedServer {
            transport = CompanionCommunityTransport(server: server)
            key = "companion:\(server.baseURL.absoluteString)"
        } else if let base = communityURL() {
            transport = DirectCommunityTransport(base: base, session: session, token: token(for: base))
            key = "direct:\(CommunityService.originKey(base))"
        } else {
            throw CommunityError.unavailable
        }
        if key != levelKey {
            levelKey = key
            level = .unknown
            updates = []
        }
        return transport
    }

    private func setLevel(_ value: APILevel, for key: String?) {
        // A slow answer from a community the app has since left doesn't count.
        if key == levelKey, level != value { level = value }
    }

    /// Forgets what was learned about the community and server, such as after
    /// the person changes the community address or the server's settings.
    func reset() {
        levelKey = nil
        bypassedServer = nil
        level = .unknown
        updates = []
    }

    /// Finds out what the community supports, when no request has yet. Screens
    /// that open without loading a feed first (a share link) call this before
    /// reading `capabilities`.
    func resolveCapabilities() async throws {
        let transport = try transport()
        guard level == .unknown else { return }
        let key = levelKey
        do {
            if transport is DirectCommunityTransport {
                var query = Community.FeedQuery()
                query.limit = 1
                _ = try await transport.send(CommunityCalls.feed(query))
            } else {
                _ = try await transport.send(CommunityCalls.tags())
            }
            setLevel(.v2, for: key)
        } catch CommunityError.notFound where transport is DirectCommunityTransport {
            setLevel(.legacy, for: key)
        } catch CommunityError.unsupported {
            setLevel(.legacy, for: key)
        }
    }

    private func decode<T: Decodable>(_ data: Data, as type: T.Type) throws -> T {
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw CommunityError.unavailable }
    }

    /// Sends a v2 request. Throws `.unsupported` when the community is from before v2.
    /// `probes` marks the request that itself tells whether a direct community has v2.
    private func send<T: Decodable>(_ call: CommunityCall, as type: T.Type = T.self, probes: Bool = false) async throws -> T {
        var transport = try transport()
        if level == .unknown, !probes, transport is DirectCommunityTransport {
            try await resolveCapabilities()
            transport = try self.transport()
        }
        if level == .legacy { throw CommunityError.unsupported }
        let key = levelKey
        let data: Data
        do {
            data = try await transport.send(call)
        } catch CommunityError.unsupported {
            setLevel(.legacy, for: key)
            throw CommunityError.unsupported
        } catch CommunityError.notSignedIn {
            // The community refused the token: the sign-in is over.
            if let direct = transport as? DirectCommunityTransport, let token = direct.token, account.session?.token == token { account.signOut() }
            throw CommunityError.notSignedIn
        }
        setLevel(.v2, for: key)
        return try decode(data, as: type)
    }

    /// Sends a request from before v2, whatever the level.
    private func sendLegacy<T: Decodable>(_ call: CommunityCall, as type: T.Type = T.self) async throws -> T {
        try decode(try await transport().send(call), as: type)
    }

    /// A connected server without a community: browse the direct one instead, as the app always has.
    private func bypassServer() throws {
        guard let server = connectedServer, communityURL() != nil else { throw CommunityError.unavailable }
        bypassedServer = server.baseURL.absoluteString
    }

    // MARK: Browsing

    private struct FeedResult: Decodable {
        var recipes: [Community.Listing]
        var cursor: String?
        var available: Bool?
    }

    /// A page of public recipes. With a community from before v2 this is a
    /// single page that honors `search` only (tag and author are filtered on
    /// the device).
    func feed(_ query: Community.FeedQuery = .init(), cursor: String? = nil) async throws -> Community.Page<Community.Listing> {
        _ = try transport()
        if level == .legacy { return try await legacyFeed(query, cursor: cursor) }
        let wasUnknown = level == .unknown
        do {
            let result = try await send(await scoped(CommunityCalls.feed(query, cursor: cursor)), as: FeedResult.self, probes: true)
            if result.available == false {
                try bypassServer()
                return try await feed(query, cursor: cursor)
            }
            return Community.Page(items: decorated(result.recipes), cursor: result.cursor)
        } catch CommunityError.unsupported {
            return try await legacyFeed(query, cursor: cursor)
        } catch CommunityError.notFound where wasUnknown && mode == .direct {
            // No v2 here, unless it was the cook or tag that wasn't found.
            try await resolveCapabilities()
            guard level == .legacy else { throw CommunityError.notFound }
            return try await legacyFeed(query, cursor: cursor)
        }
    }

    private func legacyFeed(_ query: Community.FeedQuery, cursor: String?) async throws -> Community.Page<Community.Listing> {
        guard cursor == nil else { return Community.Page(items: [], cursor: nil) }
        let search = query.search?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let call = CommunityCalls.legacyList(search: search)
        var recipes: [DTO.CommunityRecipe]
        if mode == .companion {
            let result = try await sendLegacy(call, as: DTO.CommunityList.self)
            if result.available == false {
                try bypassServer()
                return try await feed(query, cursor: cursor)
            }
            recipes = result.recipes
        } else {
            struct Page: Decodable { let recipes: [DTO.CommunityPublication] }
            recipes = try await sendLegacy(call, as: Page.self).recipes.map(\.recipe)
        }
        if search.isEmpty {
            if let author = query.author?.nilIfEmpty {
                recipes = recipes.filter { $0.author?.id == author }
            } else if let tag = query.tag?.nilIfEmpty {
                recipes = recipes.filter { ($0.tags ?? []).contains { $0.caseInsensitiveCompare(tag) == .orderedSame } }
            }
        }
        return Community.Page(items: decorated(recipes.map { Community.Listing(legacy: $0) }), cursor: nil)
    }

    /// Public recipes from the cooks the person follows, newest first. Needs an account.
    func followingFeed(cursor: String? = nil, limit: Int = 20) async throws -> Community.Page<Community.Listing> {
        let result = try await send(await scoped(CommunityCalls.followingFeed(cursor: cursor, limit: limit)), as: FeedResult.self)
        if result.available == false { throw CommunityError.unavailable }
        return Community.Page(items: decorated(result.recipes), cursor: result.cursor)
    }

    /// "Cook from your pantry": up to 100 recipes for `query`, ordered by the
    /// share of ingredients in stock, then by how many are. A 1.3.0 server
    /// matches against its own pantry; otherwise the device matches against
    /// its pantry. Always a single page.
    func pantryFeed(_ query: Community.FeedQuery = .init()) async throws -> Community.Page<Community.Listing> {
        _ = try transport()
        if mode == .companion, level != .legacy {
            do {
                let result = try await send(await scoped(CommunityCalls.feed(query, pantry: true)), as: FeedResult.self)
                if result.available == false {
                    try bypassServer()
                    return try await pantryFeed(query)
                }
                return Community.Page(items: result.recipes, cursor: nil)
            } catch CommunityError.unsupported {
                // An older server: match on the device below.
            }
        }
        var paged = query
        paged.limit = 50
        var listings: [Community.Listing] = []
        var cursor: String?
        repeat {
            let page = try await feed(paged, cursor: cursor)
            listings += page.items
            cursor = page.cursor
        } while cursor != nil && listings.count < 100
        let inStock = CommunityPantry.inStockNames(kitchen.stock())
        listings = listings.prefix(100).map { listing in
            var listing = listing
            listing.pantry = listing.pantry ?? CommunityPantry.match(ingredientNames: listing.ingredientNames, inStock: inStock)
            return listing
        }
        return Community.Page(items: CommunityPantry.ordered(listings), cursor: nil)
    }

    /// A recipe's page. `inlinePhoto` asks for the photo inside the snapshot,
    /// which saving needs; screens show `photoUrl` instead.
    func detail(id: String, inlinePhoto: Bool = false) async throws -> Community.Detail {
        _ = try transport()
        if level != .legacy {
            do {
                return decorated(try await send(await scoped(CommunityCalls.detail(id, inlinePhoto: inlinePhoto)), as: Community.Detail.self))
            } catch CommunityError.unsupported {
                // Fall through to the v1 recipe.
            }
        }
        let call = CommunityCalls.legacyDetail(id)
        if mode == .companion {
            return Community.Detail(legacy: try await sendLegacy(call, as: DTO.CommunityRecipe.self))
        }
        struct Revision: Decodable { let revision: Int? }
        let data = try await transport().send(call)
        let publication = try decode(data, as: DTO.CommunityPublication.self)
        return decorated(Community.Detail(legacy: publication.recipe, revision: (try? decode(data, as: Revision.self))?.revision ?? 0))
    }

    /// More tips than the 20 a detail carries, newest first.
    func tips(recipeID: String, cursor: String? = nil, limit: Int = 20) async throws -> Community.Page<Community.Tip> {
        struct Result: Decodable { var tips: [Community.Tip]; var cursor: String? }
        let result = try await send(CommunityCalls.tips(recipeID, cursor: cursor, limit: limit), as: Result.self)
        return Community.Page(items: result.tips, cursor: result.cursor)
    }

    /// The 30 most used tags. Empty for a community from before v2.
    func tags() async throws -> [Community.TagCount] {
        struct Result: Decodable { var tags: [Community.TagCount] }
        do {
            return try await send(CommunityCalls.tags(), as: Result.self).tags
        } catch CommunityError.unsupported {
            return []
        }
    }

    func cook(id: String) async throws -> Community.Cook {
        try await send(CommunityCalls.cook(id))
    }

    // MARK: Account

    /// Whether the person can act in the community, and their profile when
    /// they can. Doesn't throw for "not signed in".
    func accountStatus() async throws -> Community.AccountStatus {
        _ = try transport()
        if mode == .companion {
            struct Result: Decodable { var configured: Bool; var connected: Bool; var me: Community.Me? }
            do {
                let result = try await send(CommunityCalls.me(), as: Result.self)
                return Community.AccountStatus(configured: result.configured, connected: result.connected, me: result.me)
            } catch CommunityError.unsupported {
                struct Connection: Decodable { var configured: Bool; var connected: Bool }
                let result = try await sendLegacy(CommunityCalls.local("community:connection"), as: Connection.self)
                return Community.AccountStatus(configured: result.configured, connected: result.connected, me: nil)
            }
        }
        guard isSignedIn else { return Community.AccountStatus(configured: true, connected: false, me: nil) }
        do {
            return Community.AccountStatus(configured: true, connected: true, me: try await send(CommunityCalls.me(), as: Community.Me.self))
        } catch CommunityError.unsupported {
            return Community.AccountStatus(configured: true, connected: true, me: nil)
        } catch CommunityError.notSignedIn {
            return Community.AccountStatus(configured: true, connected: false, me: nil)
        }
    }

    /// The signed-in cook's profile.
    func me() async throws -> Community.Me {
        let status = try await accountStatus()
        if let me = status.me { return me }
        if level == .legacy { throw CommunityError.unsupported }
        throw mode == .companion ? CommunityError.needsServerConnection : CommunityError.notSignedIn
    }

    /// Changes the display name (1–40 characters) and/or bio (up to 160). Nil leaves a field alone.
    @discardableResult
    func updateProfile(name: String? = nil, bio: String? = nil) async throws -> Community.Me {
        let me = try await send(CommunityCalls.updateProfile(name: name, bio: bio), as: Community.Me.self)
        if mode == .direct, var session = account.session, session.userID == me.id, session.name != me.cook.name {
            session.name = me.cook.name
            account.save(session)
        }
        return me
    }

    /// Everything the cook published, including unlisted, private, removed and under-review recipes.
    func myRecipes(cursor: String? = nil) async throws -> Community.Page<Community.Listing> {
        let result = try await send(CommunityCalls.myRecipes(cursor: cursor), as: FeedResult.self)
        return Community.Page(items: result.recipes, cursor: result.cursor)
    }

    // MARK: Social

    @discardableResult
    func like(recipeID: String, liked: Bool) async throws -> Community.LikeResult {
        try await send(CommunityCalls.like(recipeID, liked: liked))
    }

    /// "I made it": a 1–5 rating and an optional tip of up to 280 characters. Sending again replaces it.
    @discardableResult
    func made(recipeID: String, rating: Int, tip: String? = nil) async throws -> Community.MadeResult {
        try await send(CommunityCalls.made(recipeID, rating: min(5, max(1, rating)), tip: tip))
    }

    @discardableResult
    func removeMade(recipeID: String) async throws -> Community.MadeResult {
        try await send(CommunityCalls.removeMade(recipeID))
    }

    @discardableResult
    func follow(userID: String, following: Bool) async throws -> Community.FollowResult {
        try await send(CommunityCalls.follow(userID, following: following))
    }

    // MARK: Reporting, hiding and moderation

    /// Reports a recipe, or one of its tips. A recipe report also hides the
    /// recipe (`title` labels it in Settings). `.useEmail` means this
    /// community can't take reports: send `CommunityReport.mailtoURL` instead.
    func report(recipeID: String, title: String, tipID: String? = nil, reason: Community.ReportReason, note: String? = nil) async throws -> Community.ReportOutcome {
        let call = CommunityCalls.report(recipeID: recipeID, tipID: tipID, reason: reason, note: note.map { String($0.prefix(Community.reportNoteLimit)) },
                                         clientKey: CommunityInstall.clientKey(purpose: "report", defaults: defaults))
        struct Result: Decodable { var success: Bool? }
        do {
            _ = try await send(call, as: Result.self)
        } catch CommunityError.unsupported {
            return .useEmail
        }
        if let tipID {
            moderation.markReported(tipID: tipID)
        } else {
            moderation.setHidden(true, recipeID: recipeID, title: title)
            // A server hides what was reported itself, but as "Reported recipe"
            // unless the kitchen has a copy. Name it, so the hidden list can.
            try? await sendHide(CommunityCalls.hide(kind: "recipe", key: recipeID, label: title, hidden: true))
        }
        return .sent
    }

    /// Hides or shows a recipe: on this device, and on a 1.3.0 server for the whole account.
    func setHidden(_ hidden: Bool, recipeID: String, title: String) async throws {
        moderation.setHidden(hidden, recipeID: recipeID, title: title)
        try await sendHide(CommunityCalls.hide(kind: "recipe", key: recipeID, label: title, hidden: hidden))
    }

    /// Blocks or unblocks a cook: on this device, and on a 1.3.0 server for the whole account.
    func setBlocked(_ blocked: Bool, author: Community.Author) async throws {
        moderation.setBlocked(blocked, author: author)
        guard !author.id.isEmpty else { return }
        try await sendHide(CommunityCalls.hide(kind: "author", key: author.id, label: author.name, hidden: blocked))
    }

    private func sendHide(_ call: CommunityCall) async throws {
        guard isAvailable, mode == .companion, level != .legacy else { return }
        struct Result: Decodable { var success: Bool? }
        do { _ = try await send(call, as: Result.self) } catch CommunityError.unsupported {}
    }

    /// What's hidden and blocked: the server's list in companion mode, this device's otherwise.
    func hidden() async throws -> HiddenList {
        if isAvailable, mode == .companion, level != .legacy {
            struct Result: Decodable { var recipes: [HiddenList.Entry]; var authors: [HiddenList.Entry] }
            do {
                let result = try await send(CommunityCalls.local("community:hidden"), as: Result.self)
                return HiddenList(recipes: result.recipes, authors: result.authors)
            } catch CommunityError.unsupported {}
        }
        func entries(_ values: [String: String]) -> [HiddenList.Entry] {
            values.map { HiddenList.Entry(key: $0.key, label: $0.value) }.sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
        }
        return HiddenList(recipes: entries(moderation.hiddenRecipes), authors: entries(moderation.blockedAuthors))
    }

    /// Moderators only (`Community.Me.moderator`); others get `.notAllowed`.
    func modReports(status: Community.ReportStatus = .open, cursor: String? = nil) async throws -> Community.Page<Community.Report> {
        struct Result: Decodable { var reports: [Community.Report]; var cursor: String? }
        let result = try await send(CommunityCalls.modReports(status: status, cursor: cursor), as: Result.self)
        return Community.Page(items: result.reports, cursor: result.cursor)
    }

    /// Resolves every open report on the same target.
    func modResolve(reportID: String, action: Community.ModAction, reason: String? = nil) async throws {
        struct Result: Decodable { var success: Bool? }
        _ = try await send(CommunityCalls.modResolve(reportID: reportID, action: action, reason: reason), as: Result.self)
    }

    // MARK: Saving

    /// Tells the community a copy was saved, once per install. Returns the new
    /// count. `save(recipeID:)` already does this.
    @discardableResult
    func recordSave(recipeID: String) async throws -> Int? {
        guard mode == .direct else { return nil }
        struct Result: Decodable { var saveCount: Int? }
        return try await send(CommunityCalls.save(recipeID, clientKey: CommunityInstall.clientKey(purpose: "save", defaults: defaults)), as: Result.self).saveCount
    }

    /// Saves a community recipe to the person's recipes. Through a server, the
    /// server makes the copy and the device syncs it; otherwise the copy is
    /// made here and remembered for update notices. Saving again returns the
    /// copy this device already has.
    @discardableResult
    func save(recipeID: String) async throws -> Community.SaveResult {
        _ = try transport()
        if mode == .companion {
            struct Result: Decodable { var savedRecipeId: String? }
            let result = try await sendLegacy(await scoped(CommunityCalls.local("community:saveRecipe", ["recipeId": recipeID])), as: Result.self)
            await sync()
            let recipe = result.savedRecipeId.flatMap { id in kitchen.fetch(Recipe.self).first { $0.serverID == id } }
            return Community.SaveResult(recipe: recipe, serverRecipeID: result.savedRecipeId, saveCount: nil)
        }
        if let existing = savedRecipe(forRemoteID: recipeID) { return Community.SaveResult(recipe: existing, serverRecipeID: nil, saveCount: nil) }
        let detail = try await detail(id: recipeID, inlinePhoto: true)
        var draft = RecipeDraft()
        Self.apply(detail.snapshot, to: &draft, photo: detail.snapshot.photoData)
        draft.sourceURL = detail.snapshot.sourceUrl
        let recipe = kitchen.save(draft)
        recipe.communityAuthor = detail.author.name.nilIfEmpty
        kitchen.changed()
        if let origin { copies.record(recipe: recipe.uuid, remoteID: recipeID, revision: detail.revision, origin: origin) }
        // Counting the save is a courtesy; the recipe is saved either way.
        let count = level == .v2 ? (try? await recordSave(recipeID: recipeID)) : nil
        return Community.SaveResult(recipe: recipe, serverRecipeID: nil, saveCount: count)
    }

    /// The copy of a community recipe this device saved in direct mode, when it still exists.
    func savedRecipe(forRemoteID remoteID: String) -> Recipe? {
        guard let origin, let uuid = copies.recipe(forRemoteID: remoteID, origin: origin) else { return nil }
        // Cards ask as they draw, so only this one recipe is read.
        var wanted = FetchDescriptor<Recipe>(predicate: #Predicate { $0.uuid == uuid })
        wanted.fetchLimit = 1
        let recipe = (try? kitchen.context.fetch(wanted))?.first
        if recipe == nil { copies.forget(recipe: uuid) }
        return recipe
    }

    /// The fields a community recipe owns in a saved copy.
    private static func apply(_ snapshot: Community.Snapshot, to draft: inout RecipeDraft, photo: Data?) {
        // Pantry links the person set up survive an update of the same ingredient.
        let mappings = Dictionary(draft.ingredients.compactMap { ingredient in ingredient.mappingLabel.map { (normalizeName(ingredient.name), $0) } },
                                  uniquingKeysWith: { first, _ in first })
        draft.title = snapshot.title
        draft.summary = snapshot.description
        draft.tags = snapshot.tags
        draft.servings = Community.servings(snapshot.servings).flatMap(Community.whole)
        draft.totalTimeMinutes = Community.minutes(snapshot.totalTimeMinutes).flatMap(Community.whole)
        draft.ingredients = snapshot.ingredients.map {
            Ingredient(name: $0.name, quantity: Community.quantity($0.quantity), unit: $0.unit, note: $0.note, mappingLabel: mappings[normalizeName($0.name)])
        }
        draft.steps = snapshot.steps.map { RecipeStep(text: $0.text) }
        draft.photo = photo
    }

    // MARK: Update notices

    /// Drops saved copies whose recipe was deleted.
    private func pruneCopies() {
        guard !copies.copies.isEmpty else { return }
        copies.prune(keeping: Set(kitchen.fetch(Recipe.self).map(\.uuid)))
    }

    /// Looks for newer revisions of saved copies and returns the ones not
    /// dismissed (also kept in `pendingUpdates`). Empty when the community
    /// can't tell.
    @discardableResult
    func checkForUpdates() async throws -> [Community.Update] {
        _ = try transport()
        // An answer for a kitchen the person has since left isn't shown.
        let asked = householdID
        var updates: [Community.Update] = []
        do {
            if mode == .companion {
                struct Result: Decodable { var updates: [Community.Update] }
                if level != .legacy { updates = try await send(await scoped(CommunityCalls.local("community:updates")), as: Result.self).updates }
            } else if let origin {
                pruneCopies()
                let tracked = copies.copies.filter { $0.value.origin == origin }
                let ids = Array(Set(tracked.values.map(\.remoteID))).sorted()
                struct Result: Decodable { var revisions: [String: Int?] }
                var latest: [String: Int] = [:]
                for start in stride(from: 0, to: ids.count, by: 100) {
                    let result = try await send(CommunityCalls.revisions(Array(ids[start..<min(ids.count, start + 100)])), as: Result.self)
                    for (id, revision) in result.revisions { if let revision { latest[id] = revision } }
                }
                let titles = Dictionary(kitchen.fetch(Recipe.self).map { ($0.uuid, $0.title) }, uniquingKeysWith: { first, _ in first })
                updates = tracked.compactMap { uuid, copy in
                    guard let revision = latest[copy.remoteID], revision > max(copy.revision, copy.dismissedRevision ?? 0) else { return nil }
                    return Community.Update(recipeId: uuid.uuidString, title: titles[uuid] ?? "", remoteId: copy.remoteID,
                                            savedRevision: copy.revision, latestRevision: revision)
                }
                .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            }
        } catch CommunityError.unsupported {
            updates = []
        }
        self.updates = updates
        updatesHousehold = asked
        return updates
    }

    /// The saved recipe an update is for.
    func recipe(for update: Community.Update) -> Recipe? {
        let uuid = UUID(uuidString: update.recipeId)
        return kitchen.fetch(Recipe.self).first { ($0.uuid == uuid && uuid != nil) || $0.serverID == update.recipeId }
    }

    /// Replaces the saved copy's title, description, tags, servings, time,
    /// photo, ingredients and steps with the latest revision. Notes,
    /// nutrition, favorites and cooking history stay.
    func applyUpdate(_ update: Community.Update) async throws {
        _ = try transport()
        if mode == .companion {
            struct Result: Decodable { var success: Bool? }
            _ = try await send(await scoped(CommunityCalls.local("community:applyUpdate", ["recipeId": update.recipeId])), as: Result.self)
            await sync()
        } else {
            guard let uuid = UUID(uuidString: update.recipeId), let recipe = kitchen.fetch(Recipe.self).first(where: { $0.uuid == uuid }) else {
                if let uuid = UUID(uuidString: update.recipeId) { copies.forget(recipe: uuid) }
                updates.removeAll { $0.id == update.id }
                throw CommunityError.notFound
            }
            let detail = try await detail(id: update.remoteId, inlinePhoto: true)
            var draft = kitchen.draft(from: recipe)
            // No inline photo although the recipe has one: keep the photo rather than lose it.
            let photo = detail.snapshot.photoData ?? (detail.photoUrl == nil ? nil : recipe.photo)
            Self.apply(detail.snapshot, to: &draft, photo: photo)
            kitchen.save(draft, into: recipe)
            if let name = detail.author.name.nilIfEmpty, recipe.communityAuthor != name {
                recipe.communityAuthor = name
                kitchen.changed()
            }
            copies.record(recipe: uuid, remoteID: update.remoteId, revision: detail.revision, origin: origin ?? copies.copy(for: uuid)?.origin ?? "")
        }
        updates.removeAll { $0.id == update.id }
    }

    /// Stops offering this revision. A later one is offered again.
    func dismissUpdate(_ update: Community.Update) async throws {
        _ = try transport()
        if mode == .companion {
            struct Result: Decodable { var success: Bool? }
            _ = try await send(await scoped(CommunityCalls.local("community:dismissUpdate", ["recipeId": update.recipeId])), as: Result.self)
        } else if let uuid = UUID(uuidString: update.recipeId) {
            copies.dismiss(recipe: uuid, revision: update.latestRevision)
        }
        updates.removeAll { $0.id == update.id }
    }

    // MARK: On-device pantry match and saved state

    /// In direct mode the device fills in what a server otherwise would:
    /// whether a copy is saved, and the pantry match.
    private func decorated(_ listings: [Community.Listing]) -> [Community.Listing] {
        guard mode == .direct, !listings.isEmpty else { return listings }
        pruneCopies()
        let saved = Set(copies.copies.values.filter { $0.origin == origin }.map(\.remoteID))
        let inStock = CommunityPantry.inStockNames(kitchen.stock())
        return listings.map { listing in
            var listing = listing
            listing.saved = saved.contains(listing.id)
            listing.pantry = CommunityPantry.match(ingredientNames: listing.ingredientNames, inStock: inStock)
            return listing
        }
    }

    private func decorated(_ detail: Community.Detail) -> Community.Detail {
        guard mode == .direct else { return detail }
        var detail = detail
        detail.listing = decorated([detail.listing])[0]
        if detail.listing.ingredientNames.isEmpty {
            detail.listing.pantry = CommunityPantry.match(ingredientNames: detail.snapshot.ingredients.map(\.name), inStock: CommunityPantry.inStockNames(kitchen.stock()))
        }
        detail.savedRecipeId = origin.flatMap { copies.recipe(forRemoteID: detail.id, origin: $0) }?.uuidString
        return detail
    }

    /// The pantry match to show for a listing: the server's when it sent one,
    /// otherwise matched against this device's pantry (direct mode only).
    func pantryMatch(for listing: Community.Listing) -> Community.PantryMatch? {
        if let pantry = listing.pantry { return pantry }
        guard mode == .direct else { return nil }
        return CommunityPantry.match(ingredientNames: listing.ingredientNames, inStock: CommunityPantry.inStockNames(kitchen.stock()))
    }
}
