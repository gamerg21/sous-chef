import Foundation
import Testing
import UIKit
@testable import SousChef

// MARK: Test doubles

nonisolated struct StubRequest: Sendable {
    let method: String
    let url: URL
    let headers: [String: String]
    let body: Data

    var path: String { url.path(percentEncoded: true) }
    var query: [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })
    }
    var json: [String: Any] { (try? JSONSerialization.jsonObject(with: body) as? [String: Any]) ?? [:] }
    var authorization: String? { headers.first { $0.key.lowercased() == "authorization" }?.value }
}

nonisolated struct StubResponse: Sendable {
    var status = 200
    var body = Data()
    var contentType = "application/json"

    static func json(_ object: Any, status: Int = 200) -> StubResponse {
        StubResponse(status: status, body: (try? JSONSerialization.data(withJSONObject: object)) ?? Data())
    }

    static func error(_ status: Int, _ message: String) -> StubResponse { json(["error": message], status: status) }
}

/// Answers requests for hosts registered by `CommunityStub`, so tests that run in parallel don't meet.
nonisolated final class CommunityStubProtocol: URLProtocol, @unchecked Sendable {
    typealias Handler = @Sendable (StubRequest) -> StubResponse

    private static let lock = NSLock()
    nonisolated(unsafe) private static var handlers: [String: Handler] = [:]
    nonisolated(unsafe) private static var recorded: [String: [StubRequest]] = [:]

    static func register(_ host: String, _ handler: @escaping Handler) {
        lock.withLock { handlers[host] = handler }
    }

    static func requests(_ host: String) -> [StubRequest] {
        lock.withLock { recorded[host] ?? [] }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, let host = url.host() else { return fail() }
        var body = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open()
            var buffer = [UInt8](repeating: 0, count: 16_384)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count <= 0 { break }
                body.append(buffer, count: count)
            }
            stream.close()
        }
        let recorded = StubRequest(method: request.httpMethod ?? "GET", url: url, headers: request.allHTTPHeaderFields ?? [:], body: body)
        let handler = Self.lock.withLock { () -> Handler? in
            Self.recorded[host, default: []].append(recorded)
            return Self.handlers[host]
        }
        guard let handler else { return fail() }
        let answer = handler(recorded)
        let response = HTTPURLResponse(url: url, statusCode: answer.status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": answer.contentType])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: answer.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private func fail() {
        client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
    }
}

/// A pretend community service at its own https host.
final class CommunityStub {
    let host = "c\(UUID().uuidString.lowercased()).example.test"
    let session: URLSession

    init(_ handler: @escaping CommunityStubProtocol.Handler = Fixture.route) {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CommunityStubProtocol.self]
        session = URLSession(configuration: configuration)
        CommunityStubProtocol.register(host, handler)
    }

    var base: URL { URL(string: "https://\(host)")! }
    var requests: [StubRequest] { CommunityStubProtocol.requests(host) }

    func respond(_ handler: @escaping CommunityStubProtocol.Handler) { CommunityStubProtocol.register(host, handler) }

    func last(_ method: String, _ path: String) -> StubRequest? {
        requests.last { $0.method == method && $0.path == path }
    }

    func count(_ path: String) -> Int { requests.count { $0.path == path } }
}

/// A pretend Sous Chef server.
final class FakeKitchenServer: KitchenCalling {
    let baseURL = URL(string: "http://kitchen.local:3000")!
    var calls: [(path: String, args: [String: Any])] = []
    var handler: (String, [String: Any]) throws -> Any

    init(_ handler: @escaping (String, [String: Any]) throws -> Any) {
        self.handler = handler
    }

    func call(_ path: String, _ args: [String: Any]) async throws -> Any {
        calls.append((path, args))
        return try handler(path, args)
    }

    func last(_ path: String) -> [String: Any]? { calls.last { $0.path == path }?.args }
    func count(_ path: String) -> Int { calls.count { $0.path == path } }

    static let unknown = ServerClient.ServerError.server("Unknown operation")
}

/// Holds values a stub's handler reads while the test changes them.
nonisolated final class Shared<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: Value

    init(_ value: Value) { stored = value }

    var value: Value {
        get { lock.withLock { stored } }
        set { lock.withLock { stored = newValue } }
    }
}

nonisolated enum Fixture {
    static let photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

    static func listing(_ id: String = "r1", title: String = "Tomato soup", author: String = "u2", revision: Int = 3,
                        ingredients: [String] = ["Tomatoes", "Salt"], extra: [String: Any] = [:]) -> [String: Any] {
        var value: [String: Any] = [
            "id": id, "revision": revision, "createdAt": "2026-11-01T10:00:00.000Z", "updatedAt": "2026-11-02T10:00:00Z",
            "author": ["id": author, "name": "Bea"], "title": title, "description": "Cozy", "tags": ["dinner", "Soup"],
            "servings": 4, "totalTimeMinutes": 30, "photoUrl": "https://files.example.test/p.jpg", "ingredientNames": ingredients,
            "likeCount": 5, "saveCount": 2, "madeCount": 1, "rating": 4.5, "shareUrl": "https://souschefkitchen.app/r/\(id)", "liked": true,
        ]
        value.merge(extra) { _, new in new }
        return value
    }

    static func detail(_ id: String = "r1", title: String = "Tomato soup", revision: Int = 3, inlinePhoto: Bool = true, extra: [String: Any] = [:]) -> [String: Any] {
        var snapshot: [String: Any] = [
            "version": 1, "title": title, "description": "Cozy", "tags": ["dinner"], "servings": 4, "totalTimeMinutes": 30,
            "sourceUrl": "https://example.test/soup",
            "ingredients": [["name": "Tomatoes", "quantity": 800, "unit": "g", "note": "ripe"], ["name": "Salt"]],
            "steps": [["text": "Simmer \(title)."]],
        ]
        if inlinePhoto { snapshot["photoDataUrl"] = photo }
        var value = listing(id, title: title, revision: revision)
        value.merge([
            "visibility": "unlisted", "snapshot": snapshot,
            "tips": [["id": "t1", "author": ["id": "u3", "name": "Cy"], "rating": 5, "tip": "Add basil", "createdAt": "2026-11-03T10:00:00Z"]],
            "viewer": ["liked": true, "following": false, "own": false, "made": ["rating": 4, "tip": "Nice"]],
        ]) { _, new in new }
        value.merge(extra) { _, new in new }
        return value
    }

    static var me: [String: Any] {
        ["id": "u1", "name": "Ada L", "bio": "Soup person", "recipeCount": 2, "followerCount": 3, "followingCount": 4,
         "viewer": ["following": false, "own": true], "moderator": true]
    }

    static var report: [String: Any] {
        [
            "id": "rep1", "status": "open", "createdAt": "2026-11-05T10:00:00Z", "reason": "spam", "note": "Ad", "reportCount": 2,
            "recipe": ["id": "r1", "title": "Tomato soup", "author": ["id": "u2", "name": "Bea"], "visibility": "public", "underReview": false],
            "tip": ["id": "t1", "author": ["id": "u3", "name": "Cy"], "rating": 1, "tip": "Buy my stuff"],
        ]
    }

    /// A v2 community that answers everything.
    @Sendable static func route(_ request: StubRequest) -> StubResponse {
        switch (request.method, request.path) {
        case ("GET", "/api/v2/recipes"): .json(["recipes": [listing()], "cursor": "c2"])
        case ("POST", "/api/v2/feed/following"), ("POST", "/api/v2/me/recipes"): .json(["recipes": [listing()], "cursor": NSNull()])
        case ("GET", "/api/v2/recipes/r1"): .json(detail(inlinePhoto: request.query["photo"] == "inline"))
        case ("GET", "/api/v2/recipes/r1/tips"):
            .json(["tips": [["id": "t2", "author": ["id": "u3", "name": "Cy"], "rating": 3, "createdAt": "2026-11-03T10:00:00Z"]], "cursor": NSNull()])
        case ("GET", "/api/v2/revisions"): .json(["revisions": ["r1": 3]])
        case ("GET", "/api/v2/tags"): .json(["tags": [["tag": "dinner", "count": 12]]])
        case ("GET", "/api/v2/cooks/u2"): .json(["id": "u2", "name": "Bea", "recipeCount": 7, "followerCount": 1, "followingCount": 0])
        case ("POST", "/api/v2/me"), ("POST", "/api/v2/me/profile"): .json(me)
        case ("POST", "/api/v2/like"): .json(["liked": true, "likeCount": 6])
        case ("POST", "/api/v2/made"): .json(["madeCount": 2, "rating": 4.5])
        case ("POST", "/api/v2/made/delete"): .json(["madeCount": 1])
        case ("POST", "/api/v2/follow"): .json(["following": true, "followerCount": 9])
        case ("POST", "/api/v2/save"): .json(["saveCount": 3])
        case ("POST", "/api/v2/report"), ("POST", "/api/v2/mod/resolve"): .json(["success": true])
        case ("POST", "/api/v2/mod/reports"): .json(["reports": [report], "cursor": NSNull()])
        default: .error(404, "Not found")
        }
    }

    /// A community from before v2: only `/api/v1/recipes`.
    @Sendable static func legacyRoute(_ request: StubRequest) -> StubResponse {
        let publication: [String: Any] = [
            "id": "old1", "revision": 2, "author": ["id": "u2", "name": "Bea"], "createdAt": "2026-10-01T10:00:00Z",
            "snapshot": ["version": 1, "title": "Old soup", "tags": ["Dinner"], "photoDataUrl": photo,
                         "ingredients": [["name": "Tomatoes", "quantity": 2]], "steps": [["text": "Cook."]]],
        ]
        switch (request.method, request.path) {
        case ("GET", "/api/v1/recipes"): return .json(["recipes": [publication]])
        case ("GET", "/api/v1/recipes/old1"): return .json(publication)
        default: return .error(404, "Not found")
        }
    }
}

/// A client wired to test doubles, with its own kitchen and settings.
struct CommunityHarness {
    let kitchen = Kitchen(inMemory: true)
    let defaults: UserDefaults
    let account: CommunityAccount
    let moderation: CommunityModeration
    let client: CommunityClient
    let syncs = Shared(0)

    static func isolatedDefaults() -> UserDefaults {
        let name = "CommunityClientTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    /// - Parameter household: The server kitchen the app shows, which a test can change.
    init(stub: CommunityStub? = nil, server: FakeKitchenServer? = nil, signedIn: Bool = false, household: Shared<String?>? = nil) {
        defaults = Self.isolatedDefaults()
        account = CommunityAccount(store: MemorySecretStore(), defaults: defaults, observeRevocation: false)
        moderation = CommunityModeration(defaults: defaults)
        if signedIn, let stub {
            account.save(CommunitySession(token: "tok", userID: "u1", name: "Ada", appleUserID: "apple-1", origin: stub.base.absoluteString))
        }
        let syncs = syncs
        client = CommunityClient(kitchen: kitchen, account: account, moderation: moderation, session: stub?.session ?? .shared, defaults: defaults,
                                 communityURL: { stub?.base }, companion: { server }, sync: { syncs.value += 1 },
                                 household: { household?.value })
    }
}

/// Lets a test hold a request open.
final class Gate {
    private var waiters: [CheckedContinuation<Void, Never>] = []

    var waiting: Int { waiters.count }

    func wait() async {
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        let resumed = waiters
        waiters = []
        resumed.forEach { $0.resume() }
    }
}

func eventually(_ condition: () -> Bool) async {
    for _ in 0..<2000 where !condition() {
        try? await Task.sleep(for: .milliseconds(2))
    }
}

// MARK: Models

@MainActor struct CommunityModelTests {
    private func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
    }

    @Test func decodesAListingWithAndWithoutOptionalFields() throws {
        let full = try decode(Community.Listing.self, Fixture.listing())
        #expect(full.id == "r1")
        #expect(full.revision == 3)
        #expect(full.author == Community.Author(id: "u2", name: "Bea"))
        #expect(full.tags == ["dinner", "Soup"])
        #expect(full.servings == 4)
        #expect(full.totalTimeMinutes == 30)
        #expect(full.photoUrl == "https://files.example.test/p.jpg")
        #expect(full.ingredientNames == ["Tomatoes", "Salt"])
        #expect((full.likeCount, full.saveCount, full.madeCount) == (5, 2, 1))
        #expect(full.rating == 4.5)
        #expect(full.shareUrl == "https://souschefkitchen.app/r/r1")
        #expect(full.liked == true)
        #expect(full.saved == nil && full.pantry == nil && full.visibility == nil)
        #expect(full.created != nil && full.updated != nil)
        #expect(full.created! < full.updated!)

        let bare = try decode(Community.Listing.self, [
            "id": "r2", "revision": 1, "createdAt": "2026-11-01T10:00:00Z", "updatedAt": "2026-11-01T10:00:00Z", "author": ["id": "u2", "name": "Bea"],
            "title": "Toast", "tags": [String](), "ingredientNames": [String](), "likeCount": 0, "saveCount": 0, "madeCount": 0,
        ])
        #expect(bare.description == nil && bare.servings == nil && bare.totalTimeMinutes == nil && bare.photoUrl == nil)
        #expect(bare.rating == nil && bare.shareUrl == nil && bare.liked == nil)
    }

    @Test func decodesLocalAndOwnListings() throws {
        let local = try decode(Community.Listing.self, Fixture.listing(extra: ["saved": true, "pantry": ["have": 1, "total": 2, "missing": ["Salt"]]]))
        #expect(local.saved == true)
        #expect(local.pantry == Community.PantryMatch(have: 1, total: 2, missing: ["Salt"]))
        #expect(local.pantry?.share == 0.5)

        let own = try decode(Community.Listing.self, Fixture.listing(extra: ["visibility": "private", "removed": true, "underReview": false]))
        #expect(own.visibility == "private")
        #expect(own.removed == true)
        #expect(own.underReview == false)
    }

    @Test func decodesADetail() throws {
        let detail = try decode(Community.Detail.self, Fixture.detail(extra: ["saved": true, "savedRecipeId": "srv9"]))
        #expect(detail.id == "r1")
        #expect(detail.title == "Tomato soup")
        #expect(detail.visibility == "unlisted")
        #expect(detail.listing.visibility == nil)
        #expect(detail.snapshot.ingredients.count == 2)
        #expect(detail.snapshot.ingredients[0] == .init(name: "Tomatoes", quantity: 800, unit: "g", note: "ripe"))
        #expect(detail.snapshot.ingredients[1].quantity == nil)
        #expect(detail.snapshot.steps.map(\.text) == ["Simmer Tomato soup."])
        #expect(detail.snapshot.photoData?.isEmpty == false)
        #expect(detail.tips.first?.tip == "Add basil")
        #expect(detail.viewer?.made == .init(rating: 4, tip: "Nice"))
        #expect(detail.viewer?.following == false)
        #expect(detail.saved == true)
        #expect(detail.savedRecipeId == "srv9")

        var anonymous = Fixture.detail(inlinePhoto: false)
        anonymous["viewer"] = nil
        anonymous["tips"] = [[String: Any]]()
        let plain = try decode(Community.Detail.self, anonymous)
        #expect(plain.viewer == nil)
        #expect(plain.tips.isEmpty)
        #expect(plain.snapshot.photoData == nil)
    }

    @Test func decodesCooksAndTheSignedInCook() throws {
        let me = try decode(Community.Me.self, Fixture.me)
        #expect(me.id == "u1")
        #expect(me.moderator)
        #expect(me.cook.bio == "Soup person")
        #expect(me.cook.viewer?.own == true)
        #expect((me.cook.recipeCount, me.cook.followerCount, me.cook.followingCount) == (2, 3, 4))

        let cook = try decode(Community.Cook.self, ["id": "u2", "name": "Bea", "recipeCount": 7, "followerCount": 1, "followingCount": 0, "blocked": true])
        #expect(cook.bio == nil && cook.viewer == nil)
        #expect(cook.blocked == true)
        #expect(cook.author == Community.Author(id: "u2", name: "Bea"))
    }

    @Test func decodesModeratorReports() throws {
        let report = try decode(Community.Report.self, Fixture.report)
        #expect(report.reason == .spam)
        #expect(report.status == Community.ReportStatus.open.rawValue)
        #expect(report.reportCount == 2)
        #expect(report.recipe?.author.name == "Bea")
        #expect(report.tip?.tip == "Buy my stuff")
        #expect(report.resolution == nil && report.resolvedAt == nil)

        var gone = Fixture.report
        gone["recipe"] = NSNull()
        gone["tip"] = nil
        gone["reason"] = "something-new"
        gone["status"] = "actioned"
        gone["resolution"] = "remove_recipe"
        let resolved = try decode(Community.Report.self, gone)
        #expect(resolved.recipe == nil && resolved.tip == nil)
        #expect(resolved.reason == .other)
        #expect(resolved.resolution == "remove_recipe")
    }

    @Test func reportReasonsUseTheContractValues() {
        #expect(Community.ReportReason.allCases.map(\.rawValue) == ["offensive", "harassment", "sexual", "spam", "dangerous", "copyright", "other"])
        // The report sheet's reasons map one to one, with the same wording.
        #expect(ReportReason.allCases.map(\.contract) == Community.ReportReason.allCases)
        #expect(ReportReason.allCases.map(\.rawValue) == Community.ReportReason.allCases.map(\.title))
        #expect(Community.ModAction.allCases.map(\.rawValue) == ["dismiss", "remove_recipe", "remove_tip", "ban_user"])
        #expect(Community.Sort.allCases.map(\.rawValue) == ["new", "hot", "top"])
    }

    @Test func mapsLegacyRecipes() {
        let recipe = DTO.CommunityRecipe(id: "old1", title: "Old soup", description: nil, tags: nil, servings: 2, totalTimeMinutes: nil, sourceUrl: nil,
                                         photoUrl: nil, photoDataUrl: Fixture.photo, ingredients: [.init(name: "Tomatoes", quantity: 2, unit: nil, note: nil)],
                                         steps: [.init(text: "Cook.")], author: .init(id: nil, name: "Bea"), createdAt: nil)
        let listing = Community.Listing(legacy: recipe)
        #expect(listing.ingredientNames == ["Tomatoes"])
        #expect(listing.photoUrl == Fixture.photo)
        #expect(listing.author == Community.Author(id: "", name: "Bea"))
        #expect(listing.tags.isEmpty && listing.likeCount == 0)
        let detail = Community.Detail(legacy: recipe, revision: 2)
        #expect(detail.revision == 2)
        #expect(detail.snapshot.steps.map(\.text) == ["Cook."])
        #expect(detail.snapshot.photoData != nil)
    }
}

// MARK: Direct transport

@MainActor struct CommunityDirectTests {
    @Test func sendsEachRequestInTheContractShape() async throws {
        let stub = CommunityStub()
        let harness = CommunityHarness(stub: stub, signedIn: true)
        let client = harness.client

        var query = Community.FeedQuery(sort: .hot, tag: "dinner", limit: 10)
        let page = try await client.feed(query, cursor: "c1")
        #expect(page.items.map(\.id) == ["r1"])
        #expect(page.cursor == "c2")
        var request = try #require(stub.last("GET", "/api/v2/recipes"))
        #expect(request.query == ["sort": "hot", "tag": "dinner", "cursor": "c1", "limit": "10"])
        #expect(request.authorization == "Bearer tok")
        #expect(client.capabilities == .init(mode: .direct, level: .v2))
        #expect(client.capabilities.social && client.capabilities.reporting && client.capabilities.updates)

        query = Community.FeedQuery(search: "a+b soup", author: "u2", limit: 500)
        _ = try await client.feed(query)
        request = try #require(stub.last("GET", "/api/v2/recipes"))
        #expect(request.query == ["sort": "new", "search": "a+b soup", "author": "u2", "limit": "50"])

        _ = try await client.followingFeed(cursor: "c2", limit: 5)
        request = try #require(stub.last("POST", "/api/v2/feed/following"))
        #expect(request.json["cursor"] as? String == "c2")
        #expect(request.json["limit"] as? Int == 5)
        #expect(request.authorization == "Bearer tok")
        #expect(request.headers["Content-Type"] == "application/json")

        let detail = try await client.detail(id: "r1", inlinePhoto: true)
        #expect(detail.snapshot.photoData != nil)
        request = try #require(stub.last("GET", "/api/v2/recipes/r1"))
        #expect(request.query == ["photo": "inline"])
        #expect(request.authorization == "Bearer tok")
        _ = try await client.detail(id: "r1")
        #expect(stub.last("GET", "/api/v2/recipes/r1")?.url.query() == nil)

        let tips = try await client.tips(recipeID: "r1", cursor: "t9")
        #expect(tips.items.first?.tip == nil)
        #expect(tips.cursor == nil)
        request = try #require(stub.last("GET", "/api/v2/recipes/r1/tips"))
        #expect(request.query == ["cursor": "t9", "limit": "20"])
        #expect(request.authorization == nil)

        #expect(try await client.tags() == [Community.TagCount(tag: "dinner", count: 12)])
        #expect(stub.last("GET", "/api/v2/tags")?.authorization == nil)

        #expect(try await client.cook(id: "u2").recipeCount == 7)
        #expect(stub.last("GET", "/api/v2/cooks/u2")?.authorization == "Bearer tok")

        let status = try await client.accountStatus()
        #expect(status.configured && status.connected)
        #expect(status.me?.moderator == true)
        request = try #require(stub.last("POST", "/api/v2/me"))
        #expect(request.json.isEmpty)
        #expect(String(decoding: request.body, as: UTF8.self) == "{}")
        #expect(request.authorization == "Bearer tok")

        let me = try await client.updateProfile(name: "Ada L")
        #expect(me.cook.name == "Ada L")
        request = try #require(stub.last("POST", "/api/v2/me/profile"))
        #expect(request.json["name"] as? String == "Ada L")
        #expect(request.json["bio"] == nil)
        // The app's account shows the new name too.
        #expect(harness.account.session?.name == "Ada L")

        _ = try await client.myRecipes(cursor: "m2")
        request = try #require(stub.last("POST", "/api/v2/me/recipes"))
        #expect(request.json["cursor"] as? String == "m2")

        #expect(try await client.like(recipeID: "r1", liked: true) == .init(liked: true, likeCount: 6))
        request = try #require(stub.last("POST", "/api/v2/like"))
        #expect(request.json["id"] as? String == "r1")
        #expect(request.json["liked"] as? Bool == true)

        #expect(try await client.made(recipeID: "r1", rating: 9, tip: "Great") == .init(madeCount: 2, rating: 4.5))
        request = try #require(stub.last("POST", "/api/v2/made"))
        #expect(request.json["rating"] as? Int == 5)
        #expect(request.json["tip"] as? String == "Great")

        #expect(try await client.removeMade(recipeID: "r1") == .init(madeCount: 1, rating: nil))
        #expect(stub.last("POST", "/api/v2/made/delete")?.json["id"] as? String == "r1")

        #expect(try await client.follow(userID: "u2", following: true) == .init(following: true, followerCount: 9))
        request = try #require(stub.last("POST", "/api/v2/follow"))
        #expect(request.json["userId"] as? String == "u2")
        #expect(request.json["following"] as? Bool == true)

        #expect(try await client.recordSave(recipeID: "r1") == 3)
        request = try #require(stub.last("POST", "/api/v2/save"))
        #expect(request.json["id"] as? String == "r1")
        #expect(request.json["clientKey"] as? String == CommunityInstall.clientKey(purpose: "save", defaults: harness.defaults))
        #expect(request.authorization == nil)

        #expect(try await client.report(recipeID: "r1", title: "Tomato soup", tipID: "t1", reason: .spam, note: " Ad ") == .sent)
        request = try #require(stub.last("POST", "/api/v2/report"))
        #expect(request.json["recipeId"] as? String == "r1")
        #expect(request.json["tipId"] as? String == "t1")
        #expect(request.json["reason"] as? String == "spam")
        #expect(request.json["note"] as? String == "Ad")
        #expect(request.json["clientKey"] as? String == CommunityInstall.clientKey(purpose: "report", defaults: harness.defaults))
        #expect(request.authorization == "Bearer tok")
        // Reporting a tip leaves the recipe showing; reporting the recipe hides it.
        #expect(harness.moderation.hiddenRecipes.isEmpty)
        #expect(try await client.report(recipeID: "r1", title: "Tomato soup", reason: .other) == .sent)
        #expect(stub.last("POST", "/api/v2/report")?.json["tipId"] == nil)
        #expect(stub.last("POST", "/api/v2/report")?.json["note"] == nil)
        #expect(harness.moderation.hiddenRecipes == ["r1": "Tomato soup"])

        let reports = try await client.modReports(status: .actioned, cursor: "m1")
        #expect(reports.items.first?.id == "rep1")
        request = try #require(stub.last("POST", "/api/v2/mod/reports"))
        #expect(request.json["status"] as? String == "actioned")
        #expect(request.json["cursor"] as? String == "m1")

        try await client.modResolve(reportID: "rep1", action: .removeRecipe, reason: "Spam")
        request = try #require(stub.last("POST", "/api/v2/mod/resolve"))
        #expect(request.json["reportId"] as? String == "rep1")
        #expect(request.json["action"] as? String == "remove_recipe")
        #expect(request.json["reason"] as? String == "Spam")
    }

    @Test func keepsTheTokenForItsOwnCommunity() async throws {
        let stub = CommunityStub()
        let harness = CommunityHarness(stub: stub)
        harness.account.save(CommunitySession(token: "other", userID: "u1", name: "Ada", appleUserID: "apple-1", origin: "https://another.example.test"))
        #expect(!harness.client.isSignedIn)
        _ = try await harness.client.feed()
        #expect(stub.last("GET", "/api/v2/recipes")?.authorization == nil)

        // Signed-in actions fail before anything is sent, and the other community's account stays.
        await #expect(throws: CommunityError.notSignedIn) { try await harness.client.like(recipeID: "r1", liked: true) }
        #expect(stub.count("/api/v2/like") == 0)
        #expect(harness.account.isSignedIn)
        let status = try await harness.client.accountStatus()
        #expect(status.configured && !status.connected && status.me == nil)
        #expect(stub.count("/api/v2/me") == 0)
    }

    @Test func encodesIDsAsOnePathSegment() throws {
        let transport = DirectCommunityTransport(base: URL(string: "https://example.test/community/")!, session: .shared, token: nil)
        let url = try transport.url(for: CommunityCalls.detail("a/b c?", inlinePhoto: false))
        #expect(url.absoluteString == "https://example.test/community/api/v2/recipes/a%2Fb%20c%3F")
        let search = try transport.url(for: CommunityCalls.feed(Community.FeedQuery(search: "1+1 & more")))
        #expect(search.query(percentEncoded: true)?.contains("search=1%2B1%20%26%20more") == true)
    }

    @Test func mapsHTTPErrors() async throws {
        let answer = Shared(StubResponse.error(429, "Slow down"))
        let stub = CommunityStub { request in
            request.method == "GET" ? Fixture.route(request) : answer.value
        }
        let harness = CommunityHarness(stub: stub, signedIn: true)
        func like() async throws { try await harness.client.like(recipeID: "r1", liked: true) }

        await #expect(throws: CommunityError.rateLimited) { try await like() }

        answer.value = .error(400, "This text isn't allowed in the community")
        await #expect(throws: CommunityError.filtered("This text isn't allowed in the community")) { try await like() }
        #expect(CommunityError.filtered("This text isn't allowed in the community").localizedDescription == "This text isn't allowed in the community")

        answer.value = .error(400, "Rating must be 1 to 5")
        await #expect(throws: CommunityError.invalid("Rating must be 1 to 5")) { try await like() }

        answer.value = .error(403, "Moderators only")
        await #expect(throws: CommunityError.notAllowed("Moderators only")) { try await like() }

        answer.value = .error(404, "Not found")
        await #expect(throws: CommunityError.notFound) { try await like() }

        answer.value = StubResponse(status: 500, body: Data("oops".utf8))
        await #expect(throws: CommunityError.unavailable) { try await like() }

        answer.value = StubResponse(status: 200, body: Data("not json".utf8))
        await #expect(throws: CommunityError.unavailable) { try await like() }

        // A refused token ends the sign-in, so the app asks again instead of failing forever.
        answer.value = .error(401, "Invalid token")
        #expect(harness.account.isSignedIn)
        await #expect(throws: CommunityError.notSignedIn) { try await like() }
        #expect(!harness.account.isSignedIn)
        let sent = stub.count("/api/v2/like")
        await #expect(throws: CommunityError.notSignedIn) { try await like() }
        #expect(stub.count("/api/v2/like") == sent)

        for error in [CommunityError.notSignedIn, .needsServerConnection, .rateLimited, .notFound, .unsupported, .unavailable] {
            #expect(error.localizedDescription.isEmpty == false)
        }
    }

    @Test func failsWithoutACommunity() async {
        let harness = CommunityHarness()
        #expect(!harness.client.isAvailable)
        await #expect(throws: CommunityError.unavailable) { try await harness.client.feed() }
    }

    @Test func fallsBackToV1Browsing() async throws {
        let stub = CommunityStub(Fixture.legacyRoute)
        let harness = CommunityHarness(stub: stub, signedIn: true)
        let client = harness.client
        #expect(!client.capabilities.isKnown)

        let page = try await client.feed(Community.FeedQuery(search: "soup"))
        #expect(page.items.map(\.id) == ["old1"])
        #expect(page.cursor == nil)
        #expect(page.items[0].photoUrl == Fixture.photo)
        #expect(page.items[0].ingredientNames == ["Tomatoes"])
        #expect(stub.last("GET", "/api/v1/recipes")?.query == ["search": "soup", "limit": "50"])
        #expect(client.capabilities == .init(mode: .direct, level: .legacy))
        #expect(!client.capabilities.social && !client.capabilities.reporting && !client.capabilities.updates && !client.capabilities.browsing)

        // Later loads go straight to v1, and there is no second page.
        let v2Requests = stub.count("/api/v2/recipes")
        #expect(try await client.feed(Community.FeedQuery(tag: "dinner")).items.count == 1)
        #expect(try await client.feed(Community.FeedQuery(tag: "dessert")).items.isEmpty)
        #expect(try await client.feed(Community.FeedQuery(author: "u2")).items.count == 1)
        #expect(try await client.feed(cursor: "more").items.isEmpty)
        #expect(stub.count("/api/v2/recipes") == v2Requests)

        await #expect(throws: CommunityError.unsupported) { try await client.like(recipeID: "old1", liked: true) }
        #expect(try await client.tags().isEmpty)
        #expect(try await client.report(recipeID: "old1", title: "Old soup", reason: .spam) == .useEmail)
        #expect(harness.moderation.hiddenRecipes.isEmpty)
        #expect(try await client.checkForUpdates().isEmpty)
        #expect(try await client.accountStatus() == .init(configured: true, connected: true, me: nil))

        let detail = try await client.detail(id: "old1")
        #expect(detail.snapshot.steps.map(\.text) == ["Cook."])
        #expect(detail.revision == 2)

        // Saving still works, from the v1 recipe.
        let saved = try await client.save(recipeID: "old1")
        #expect(saved.recipe?.title == "Old soup")
        #expect(saved.recipe?.photo != nil)
        #expect(saved.recipe?.communityAuthor == "Bea")
        #expect(saved.saveCount == nil)
        #expect(stub.count("/api/v2/save") == 0)
        #expect(try await client.feed().items.first?.saved == true)
    }

    @Test func settlesCapabilitiesBeforeTheFirstOtherRequest() async throws {
        let legacy = CommunityStub(Fixture.legacyRoute)
        let old = CommunityHarness(stub: legacy).client
        #expect(try await old.detail(id: "old1").title == "Old soup")
        #expect(old.level == .legacy)

        let stub = CommunityStub()
        let new = CommunityHarness(stub: stub).client
        try await new.resolveCapabilities()
        #expect(new.level == .v2)
        #expect(stub.last("GET", "/api/v2/recipes")?.query["limit"] == "1")
        try await new.resolveCapabilities()
        #expect(stub.requests.count == 1)

        // A cook who isn't there is "not found", not an old community.
        let picky = CommunityStub { request in
            request.query["author"] == "ghost" ? .error(404, "Not found") : Fixture.route(request)
        }
        let client = CommunityHarness(stub: picky).client
        await #expect(throws: CommunityError.notFound) { try await client.feed(Community.FeedQuery(author: "ghost")) }
        #expect(client.level == .v2)
    }
}

// MARK: Companion transport

@MainActor struct CommunityCompanionTests {
    /// A 1.3.0 server.
    private func server() -> FakeKitchenServer {
        FakeKitchenServer { path, _ in
            switch path {
            case "community:feed", "community:followingFeed":
                return ["recipes": [Fixture.listing(extra: ["saved": true, "pantry": ["have": 1, "total": 2, "missing": ["Salt"]]])], "cursor": NSNull(), "available": true]
            case "community:myRecipes": return ["recipes": [Fixture.listing(extra: ["visibility": "private", "removed": false, "underReview": true])], "cursor": NSNull()]
            case "community:recipe": return Fixture.detail(inlinePhoto: false, extra: ["saved": true, "savedRecipeId": "srv9"])
            case "community:tips": return ["tips": [[String: Any]](), "cursor": NSNull()]
            case "community:tags": return ["tags": [["tag": "dinner", "count": 12]]]
            case "community:cook": return ["id": "u2", "name": "Bea", "recipeCount": 7, "followerCount": 1, "followingCount": 0, "blocked": false]
            case "community:me": return ["configured": true, "connected": true, "me": Fixture.me]
            case "community:updateProfile": return Fixture.me
            case "community:like": return ["liked": false, "likeCount": 4]
            case "community:made": return ["madeCount": 2, "rating": 4.5]
            case "community:removeMade": return ["madeCount": 1]
            case "community:follow": return ["following": false, "followerCount": 8]
            case "community:hidden": return ["recipes": [["key": "r1", "label": "Tomato soup"]], "authors": [["key": "u9", "label": "Troll"]]]
            case "community:updates":
                return ["updates": [["recipeId": "srv9", "title": "Tomato soup", "remoteId": "r1", "savedRevision": 3, "latestRevision": 4]]]
            case "community:modReports": return ["reports": [Fixture.report], "cursor": NSNull()]
            case "community:saveRecipe": return ["savedRecipeId": "srv9"]
            case "community:report", "community:hide", "community:applyUpdate", "community:dismissUpdate", "community:modResolve": return ["success": true]
            default: throw FakeKitchenServer.unknown
            }
        }
    }

    @Test func callsEachLocalOperationWithItsArguments() async throws {
        let server = server()
        // A direct community is configured too; the connected server still wins.
        let stub = CommunityStub()
        let harness = CommunityHarness(stub: stub, server: server, signedIn: true)
        let client = harness.client
        #expect(client.mode == .companion)

        let page = try await client.feed(Community.FeedQuery(sort: .top, tag: "dinner", limit: 10), cursor: "c1")
        #expect(page.items.first?.saved == true)
        #expect(page.items.first?.pantry?.missing == ["Salt"])
        var args = try #require(server.last("community:feed"))
        #expect(args["sort"] as? String == "top")
        #expect(args["tag"] as? String == "dinner")
        #expect(args["cursor"] as? String == "c1")
        #expect(args["limit"] as? Int == 10)
        #expect(args["pantry"] == nil && args["search"] == nil && args["author"] == nil)
        #expect(client.capabilities == .init(mode: .companion, level: .v2))

        let pantry = try await client.pantryFeed(Community.FeedQuery(search: "soup"))
        #expect(pantry.cursor == nil)
        args = try #require(server.last("community:feed"))
        #expect(args["pantry"] as? Bool == true)
        #expect(args["search"] as? String == "soup")

        _ = try await client.followingFeed(cursor: "c2", limit: 5)
        args = try #require(server.last("community:followingFeed"))
        #expect(args["cursor"] as? String == "c2")
        #expect(args["limit"] as? Int == 5)

        let detail = try await client.detail(id: "r1", inlinePhoto: true)
        #expect(detail.saved == true)
        #expect(detail.savedRecipeId == "srv9")
        #expect(server.last("community:recipe")?["id"] as? String == "r1")
        #expect(server.last("community:recipe")?.count == 1)

        _ = try await client.tips(recipeID: "r1", cursor: "t9")
        args = try #require(server.last("community:tips"))
        #expect(args["id"] as? String == "r1")
        #expect(args["cursor"] as? String == "t9")

        #expect(try await client.tags().count == 1)
        #expect(server.last("community:tags")?.isEmpty == true)

        #expect(try await client.cook(id: "u2").blocked == false)
        #expect(server.last("community:cook")?["id"] as? String == "u2")

        let status = try await client.accountStatus()
        #expect(status.configured && status.connected && status.me?.id == "u1")
        #expect(server.last("community:me")?.isEmpty == true)
        #expect(try await client.me().moderator)

        _ = try await client.updateProfile(bio: "Soup person")
        args = try #require(server.last("community:updateProfile"))
        #expect(args["bio"] as? String == "Soup person")
        #expect(args["name"] == nil)
        // The Sign in with Apple account isn't the one the server uses.
        #expect(harness.account.session?.name == "Ada")

        let mine = try await client.myRecipes()
        #expect(mine.items.first?.underReview == true)
        #expect(server.last("community:myRecipes")?.isEmpty == true)

        #expect(try await client.like(recipeID: "r1", liked: false) == .init(liked: false, likeCount: 4))
        args = try #require(server.last("community:like"))
        #expect(args["id"] as? String == "r1")
        #expect(args["liked"] as? Bool == false)

        _ = try await client.made(recipeID: "r1", rating: 4, tip: "")
        args = try #require(server.last("community:made"))
        #expect(args["rating"] as? Int == 4)
        #expect(args["tip"] == nil)

        _ = try await client.removeMade(recipeID: "r1")
        #expect(server.last("community:removeMade")?["id"] as? String == "r1")

        _ = try await client.follow(userID: "u2", following: false)
        args = try #require(server.last("community:follow"))
        #expect(args["userId"] as? String == "u2")
        #expect(args["following"] as? Bool == false)

        #expect(try await client.report(recipeID: "r1", title: "Tomato soup", tipID: "t1", reason: .harassment, note: "Rude") == .sent)
        args = try #require(server.last("community:report"))
        #expect(args["recipeId"] as? String == "r1")
        #expect(args["tipId"] as? String == "t1")
        #expect(args["reason"] as? String == "harassment")
        #expect(args["note"] as? String == "Rude")
        #expect(args["clientKey"] == nil)
        // A reported tip hides nothing else.
        #expect(server.count("community:hide") == 0)

        // A reported recipe is named on the server, which hides it as "Reported recipe" by itself.
        #expect(try await client.report(recipeID: "r2", title: "Leek soup", reason: .spam) == .sent)
        #expect(server.last("community:report")?["tipId"] == nil)
        args = try #require(server.last("community:hide"))
        #expect(args["kind"] as? String == "recipe")
        #expect(args["key"] as? String == "r2")
        #expect(args["label"] as? String == "Leek soup")
        #expect(args["hidden"] as? Bool == true)
        #expect(harness.moderation.hiddenRecipes["r2"] == "Leek soup")

        try await client.setHidden(true, recipeID: "r1", title: "Tomato soup")
        args = try #require(server.last("community:hide"))
        #expect(args["kind"] as? String == "recipe")
        #expect(args["key"] as? String == "r1")
        #expect(args["label"] as? String == "Tomato soup")
        #expect(args["hidden"] as? Bool == true)
        #expect(harness.moderation.hiddenRecipes["r1"] == "Tomato soup")

        try await client.setBlocked(true, author: Community.Author(id: "u9", name: "Troll"))
        args = try #require(server.last("community:hide"))
        #expect(args["kind"] as? String == "author")
        #expect(args["key"] as? String == "u9")
        #expect(args["label"] as? String == "Troll")
        #expect(harness.moderation.isBlocked(Community.Author(id: "u9", name: "Troll")))
        try await client.setBlocked(false, author: Community.Author(id: "u9", name: "Troll"))
        #expect(server.last("community:hide")?["hidden"] as? Bool == false)
        #expect(harness.moderation.blockedAuthors.isEmpty)

        let hidden = try await client.hidden()
        #expect(hidden.recipes == [.init(key: "r1", label: "Tomato soup")])
        #expect(hidden.authors == [.init(key: "u9", label: "Troll")])

        _ = try await client.modReports()
        #expect(server.last("community:modReports")?["status"] as? String == "open")
        try await client.modResolve(reportID: "rep1", action: .banUser)
        args = try #require(server.last("community:modResolve"))
        #expect(args["reportId"] as? String == "rep1")
        #expect(args["action"] as? String == "ban_user")
        #expect(args["reason"] == nil)

        // The server counts saves itself; the device only syncs the new recipe.
        #expect(try await client.recordSave(recipeID: "r1") == nil)
        let copy = Recipe(title: "Tomato soup")
        copy.serverID = "srv9"
        harness.kitchen.context.insert(copy)
        let saved = try await client.save(recipeID: "r1")
        #expect(server.last("community:saveRecipe")?["recipeId"] as? String == "r1")
        #expect(saved.serverRecipeID == "srv9")
        #expect(saved.recipe === copy)
        #expect(harness.syncs.value == 1)
        #expect(harness.client.copies.copies.isEmpty)

        let updates = try await client.checkForUpdates()
        #expect(updates == [Community.Update(recipeId: "srv9", title: "Tomato soup", remoteId: "r1", savedRevision: 3, latestRevision: 4)])
        #expect(client.pendingUpdates == updates)
        #expect(client.recipe(for: updates[0]) === copy)
        try await client.applyUpdate(updates[0])
        #expect(server.last("community:applyUpdate")?["recipeId"] as? String == "srv9")
        #expect(harness.syncs.value == 2)
        #expect(client.pendingUpdates.isEmpty)
        try await client.dismissUpdate(updates[0])
        #expect(server.last("community:dismissUpdate")?["recipeId"] as? String == "srv9")

        // Nothing went to the community directly.
        #expect(stub.requests.isEmpty)
    }

    @Test func fallsBackOnAServerOlderThan1_3() async throws {
        let server = FakeKitchenServer { path, args in
            switch path {
            case "community:listRecipes":
                return ["available": true, "recipes": [[
                    "id": "old1", "title": "Old soup", "tags": ["Dinner"], "photoUrl": Fixture.photo, "author": ["id": "u2", "name": "Bea"], "createdAt": "2026-10-01T10:00:00Z",
                    "ingredients": [["id": "0", "name": "Tomatoes", "quantity": 2]], "steps": [["id": "0", "text": "Cook."]], "likes": 0, "savedCount": 0,
                ]]]
            case "community:getRecipe":
                return ["id": args["id"] ?? "", "title": "Old soup", "ingredients": [["name": "Tomatoes"]], "steps": [["text": "Cook."]], "author": ["id": "u2", "name": "Bea"]]
            case "community:saveRecipe": return ["savedRecipeId": "srv1"]
            case "community:connection": return ["configured": true, "connected": false]
            default: throw FakeKitchenServer.unknown
            }
        }
        let harness = CommunityHarness(server: server)
        let client = harness.client
        #expect(client.capabilities == .init(mode: .companion, level: .unknown))

        let page = try await client.feed(Community.FeedQuery(sort: .hot, search: " soup "))
        #expect(page.items.map(\.id) == ["old1"])
        #expect(page.items[0].photoUrl == Fixture.photo)
        #expect(page.items[0].ingredientNames == ["Tomatoes"])
        #expect(page.items[0].likeCount == 0)
        #expect(page.cursor == nil)
        let args = try #require(server.last("community:listRecipes"))
        #expect(args["search"] as? String == "soup")
        #expect(args["limit"] as? Int == 50)
        #expect(args.count == 2)
        #expect(client.capabilities == .init(mode: .companion, level: .legacy))
        #expect(!client.capabilities.social)

        // Once known, the new operations aren't tried again.
        _ = try await client.feed()
        #expect(server.count("community:feed") == 1)

        await #expect(throws: CommunityError.unsupported) { try await client.like(recipeID: "old1", liked: true) }
        await #expect(throws: CommunityError.unsupported) { try await client.followingFeed() }
        #expect(server.count("community:like") == 0)
        #expect(try await client.tags().isEmpty)
        #expect(try await client.report(recipeID: "old1", title: "Old soup", reason: .spam) == .useEmail)
        #expect(try await client.checkForUpdates().isEmpty)
        #expect(try await client.accountStatus() == .init(configured: true, connected: false, me: nil))
        try await client.setHidden(true, recipeID: "old1", title: "Old soup")
        #expect(harness.moderation.hiddenRecipes["old1"] == "Old soup")
        #expect(server.count("community:hide") == 0)
        #expect(try await client.hidden().recipes == [.init(key: "old1", label: "Old soup")])

        #expect(try await client.detail(id: "old1").snapshot.ingredients.map(\.name) == ["Tomatoes"])
        #expect(server.last("community:getRecipe")?["id"] as? String == "old1")

        // The pantry order is worked out on the device instead.
        harness.kitchen.context.insert(PantryItem(name: "tomatoes"))
        #expect(try await client.pantryFeed().items.first?.pantry == Community.PantryMatch(have: 1, total: 1, missing: []))

        let saved = try await client.save(recipeID: "old1")
        #expect(server.last("community:saveRecipe")?["recipeId"] as? String == "old1")
        #expect(saved.serverRecipeID == "srv1")
        #expect(harness.syncs.value == 1)
    }

    @Test func noticesAnOldServerOnAnyRequest() async throws {
        let server = FakeKitchenServer { _, _ in throw FakeKitchenServer.unknown }
        let client = CommunityHarness(server: server).client
        await #expect(throws: CommunityError.unsupported) { try await client.cook(id: "u2") }
        #expect(client.level == .legacy)
    }

    @Test func mapsServerErrors() async throws {
        let failure = Shared(ServerClient.ServerError.server("Connect your community account first"))
        let server = FakeKitchenServer { path, _ in
            if path == "community:feed" { return ["recipes": [[String: Any]](), "cursor": NSNull(), "available": true] }
            throw failure.value
        }
        let client = CommunityHarness(server: server).client
        _ = try await client.feed()
        func like() async throws { try await client.like(recipeID: "r1", liked: true) }

        await #expect(throws: CommunityError.needsServerConnection) { try await like() }
        failure.value = .server("This text isn't allowed in the community")
        await #expect(throws: CommunityError.filtered("This text isn't allowed in the community")) { try await like() }
        failure.value = .server("Too many requests")
        await #expect(throws: CommunityError.rateLimited) { try await like() }
        failure.value = .server("You can't rate your own recipe")
        await #expect(throws: CommunityError.server("You can't rate your own recipe")) { try await like() }
        failure.value = .unreachable
        await #expect(throws: CommunityError.unavailable) { try await like() }
        failure.value = .notAuthenticated
        await #expect(throws: CommunityError.server("Your server session ended. Sign in again.")) { try await like() }
        #expect(client.level == .v2)
    }

    @Test func browsesDirectlyWhenTheServerHasNoCommunity() async throws {
        let server = FakeKitchenServer { path, _ in
            if path == "community:feed" { return ["recipes": [[String: Any]](), "cursor": NSNull(), "available": false] }
            throw FakeKitchenServer.unknown
        }
        let stub = CommunityStub()
        let client = CommunityHarness(stub: stub, server: server).client
        #expect(client.mode == .companion)
        let page = try await client.feed()
        #expect(page.items.map(\.id) == ["r1"])
        #expect(client.capabilities == .init(mode: .direct, level: .v2))
        _ = try await client.feed()
        #expect(server.count("community:feed") == 1)
        client.reset()
        #expect(client.mode == .companion)

        // Without a direct community there is nothing to fall back to.
        let alone = CommunityHarness(server: server).client
        await #expect(throws: CommunityError.unavailable) { try await alone.feed() }
    }
}

// MARK: Pager

@MainActor struct CommunityFeedPagerTests {
    private func listing(_ id: String, title: String = "Soup", author: String = "u2") -> Community.Listing {
        Community.Listing(id: id, revision: 1, createdAt: "", updatedAt: "", author: .init(id: author, name: "Bea"), title: title, tags: [],
                          ingredientNames: [], likeCount: 0, saveCount: 0, madeCount: 0)
    }

    final class Recorder {
        var cursors: [String?] = []
        var held = false
        var failing = false
    }

    @Test func dropsDuplicatesAndAppliesModeration() async throws {
        let moderation = CommunityModeration(defaults: CommunityHarness.isolatedDefaults())
        moderation.setHidden(true, recipeID: "r2", title: "Hidden")
        moderation.setBlocked(true, author: .init(id: "u9", name: "Troll"))
        let term = try #require(ContentFilter.terms.sorted().first)
        let recorder = Recorder()
        let pages: [String?: Community.Page<Community.Listing>] = [
            nil: .init(items: [listing("r1"), listing("r2"), listing("r1")], cursor: "c1"),
            // Everything here is hidden, so the pager goes on to the next page itself.
            "c1": .init(items: [listing("r3", author: "u9"), listing("r4", title: "A \(term) pie"), listing("r1")], cursor: "c2"),
            "c2": .init(items: [listing("r5")], cursor: nil),
        ]
        let pager = CommunityFeedPager(moderation: moderation) { cursor in
            recorder.cursors.append(cursor)
            return pages[cursor]!
        }
        #expect(!pager.hasLoaded && pager.listings.isEmpty)

        await pager.loadFirstPage()
        #expect(pager.listings.map(\.id) == ["r1"])
        #expect(pager.loaded.map(\.id) == ["r1", "r2"])
        #expect(pager.hasLoaded && pager.hasMore && !pager.isLoading)
        await pager.loadFirstPage()
        #expect(recorder.cursors == [nil])

        // Only the last row asks for more.
        await pager.loadMoreIfNeeded(after: listing("r2"))
        #expect(recorder.cursors == [nil])
        await pager.loadMoreIfNeeded(after: listing("r1"))
        #expect(recorder.cursors == [nil, "c1", "c2"])
        #expect(pager.listings.map(\.id) == ["r1", "r5"])
        #expect(!pager.hasMore)
        await pager.loadMore()
        #expect(recorder.cursors.count == 3)

        // Moderation changes show at once, both ways.
        moderation.setHidden(true, recipeID: "r1", title: "Soup")
        #expect(pager.listings.map(\.id) == ["r5"])
        moderation.setBlocked(false, author: .init(id: "u9", name: "Troll"))
        #expect(pager.listings.map(\.id) == ["r3", "r5"])

        pager.update(id: "r5") { $0.likeCount = 9 }
        #expect(pager.listings.last?.likeCount == 9)
        pager.remove(id: "r5")
        #expect(pager.listings.map(\.id) == ["r3"])

        // A refresh starts over; with the first page all hidden now, it goes on to the next.
        await pager.refresh()
        #expect(Array(recorder.cursors.suffix(2)) == [nil, "c1"])
        #expect(pager.loaded.map(\.id) == ["r1", "r2", "r3", "r4"])
        #expect(pager.listings.map(\.id) == ["r3"])

        // The cook's own recipes aren't filtered.
        let own = CommunityFeedPager(moderation: nil) { _ in .init(items: [self.listing("r2"), self.listing("r4", title: "A \(term) pie")], cursor: nil) }
        await own.loadFirstPage()
        #expect(own.listings.count == 2)
    }

    @Test func neverRunsTwoLoadsAtOnce() async {
        let recorder = Recorder()
        let gate = Gate()
        let pager = CommunityFeedPager(moderation: nil) { cursor in
            recorder.cursors.append(cursor)
            await gate.wait()
            return .init(items: [self.listing("r\(recorder.cursors.count)")], cursor: "next")
        }

        // The view appearing twice still loads the first page once.
        async let first: Void = pager.loadFirstPage()
        async let second: Void = pager.loadFirstPage()
        await eventually { gate.waiting == 1 }
        #expect(pager.isLoading && !pager.isLoadingMore)
        await pager.loadMore()
        #expect(recorder.cursors == [nil])
        gate.open()
        _ = await (first, second)
        #expect(recorder.cursors == [nil])
        #expect(pager.listings.count == 1)

        // Many rows appearing at once ask for one next page.
        let more = (0..<5).map { _ in Task { await pager.loadMore() } }
        await eventually { gate.waiting == 1 }
        #expect(pager.isLoadingMore)
        gate.open()
        for task in more { await task.value }
        #expect(recorder.cursors == [nil, "next"])
        #expect(pager.listings.count == 2)
        #expect(!pager.isLoading)
    }

    @Test func aRefreshReplacesALoadInFlight() async {
        let recorder = Recorder()
        let gate = Gate()
        let pager = CommunityFeedPager(moderation: nil) { cursor in
            recorder.cursors.append(cursor)
            let call = recorder.cursors.count
            if recorder.held { await gate.wait() }
            return .init(items: [self.listing(cursor == nil ? "first\(call)" : "more\(call)")], cursor: "next")
        }
        await pager.loadFirstPage()
        #expect(pager.listings.map(\.id) == ["first1"])

        recorder.held = true
        async let more: Void = pager.loadMore()
        await eventually { gate.waiting == 1 }
        async let refreshed: Void = pager.refresh()
        await eventually { gate.waiting == 2 }
        // What's on screen stays while the refresh runs.
        #expect(pager.listings.map(\.id) == ["first1"])
        gate.open()
        _ = await (more, refreshed)

        // The stale page never lands after, or before, the fresh one.
        #expect(recorder.cursors == [nil, "next", nil])
        #expect(pager.listings.map(\.id) == ["first3"])
        #expect(!pager.isLoading && !pager.isLoadingMore)

        recorder.held = false
        await pager.loadMore()
        #expect(pager.listings.map(\.id) == ["first3", "more4"])
    }

    @Test func keepsWhatIsShownWhenALoadFails() async {
        let recorder = Recorder()
        let pager = CommunityFeedPager(moderation: nil) { cursor in
            if recorder.failing { throw CommunityError.rateLimited }
            return .init(items: [self.listing(cursor ?? "r1")], cursor: "c1")
        }
        await pager.loadFirstPage()
        recorder.failing = true
        await pager.loadMore()
        #expect(pager.error as? CommunityError == .rateLimited)
        #expect(pager.errorMessage == CommunityError.rateLimited.localizedDescription)
        #expect(pager.listings.map(\.id) == ["r1"])
        #expect(pager.hasMore && !pager.isLoading)
        await pager.refresh()
        #expect(pager.listings.map(\.id) == ["r1"])

        recorder.failing = false
        await pager.loadMore()
        #expect(pager.error == nil)
        #expect(pager.listings.map(\.id) == ["r1", "c1"])
    }

    @Test func pagesThroughTheClient() async throws {
        let stub = CommunityStub { request in
            guard request.path == "/api/v2/recipes" else { return .error(404, "Not found") }
            switch request.query["cursor"] {
            case nil: return .json(["recipes": [Fixture.listing("r1"), Fixture.listing("r2")], "cursor": "c1"])
            case "c1": return .json(["recipes": [Fixture.listing("r2"), Fixture.listing("r3")], "cursor": NSNull()])
            default: return .error(400, "Bad cursor")
            }
        }
        let harness = CommunityHarness(stub: stub)
        harness.moderation.setHidden(true, recipeID: "r3", title: "Soup")
        let pager = CommunityFeedPager(client: harness.client, source: .feed(Community.FeedQuery(tag: "dinner")))
        await pager.loadFirstPage()
        await pager.loadMore()
        #expect(pager.listings.map(\.id) == ["r1", "r2"])
        #expect(!pager.hasMore && pager.error == nil)
        #expect(stub.requests.map { $0.query["tag"] } == ["dinner", "dinner"])
    }
}

// MARK: Pantry

@MainActor struct CommunityPantryTests {
    private func listing(_ id: String, _ ingredients: [String]) -> Community.Listing {
        Community.Listing(id: id, revision: 1, createdAt: "", updatedAt: "", author: .init(id: "u2", name: "Bea"), title: id, tags: [],
                          ingredientNames: ingredients, likeCount: 0, saveCount: 0, madeCount: 0)
    }

    @Test func matchesIngredientNamesAgainstStock() {
        let stock = [
            StockLine(id: UUID(), name: "  Olive   Oil ", quantity: 1, unit: "bottle"),
            StockLine(id: UUID(), name: "Eggs", quantity: 0, unit: "each"),
            StockLine(id: UUID(), name: "SALT", quantity: 200, unit: "g"),
        ]
        let inStock = CommunityPantry.inStockNames(stock)
        #expect(inStock == ["olive oil", "salt"])

        let match = CommunityPantry.match(ingredientNames: ["olive oil", "Salt", " salt ", "Eggs", "Flour", ""], inStock: inStock)
        #expect(match == Community.PantryMatch(have: 2, total: 4, missing: ["Eggs", "Flour"]))
        #expect(match.share == 0.5)
        #expect(!match.isReady)
        #expect(CommunityPantry.match(ingredientNames: [], inStock: inStock).share == 0)
        #expect(CommunityPantry.match(ingredientNames: ["Salt"], inStock: inStock).isReady)
    }

    @Test func ordersByShareOnHandThenCount() {
        func matched(_ id: String, _ have: Int, _ total: Int) -> Community.Listing {
            var listing = listing(id, [])
            listing.pantry = Community.PantryMatch(have: have, total: total, missing: [])
            return listing
        }
        let ordered = CommunityPantry.ordered([
            matched("half-small", 1, 2), matched("none", 0, 3), matched("all-small", 2, 2), listing("unknown", []),
            matched("half-big", 3, 6), matched("all-big", 5, 5), matched("empty", 0, 0), matched("half-small-2", 1, 2),
        ])
        #expect(ordered.map(\.id) == ["all-big", "all-small", "half-big", "half-small", "half-small-2", "none", "empty", "unknown"])
    }

    @Test func ordersADirectFeedOnTheDevice() async throws {
        let stub = CommunityStub { request in
            guard request.path == "/api/v2/recipes" else { return .error(404, "Not found") }
            if request.query["cursor"] == nil {
                return .json(["recipes": [Fixture.listing("none", ingredients: ["Saffron"]), Fixture.listing("half", ingredients: ["Tomatoes", "Cream"])], "cursor": "c1"])
            }
            return .json(["recipes": [Fixture.listing("all", ingredients: ["tomatoes", "salt"]), Fixture.listing("most", ingredients: ["Tomatoes", "Salt", "Basil"])], "cursor": NSNull()])
        }
        let harness = CommunityHarness(stub: stub)
        harness.kitchen.context.insert(PantryItem(name: "Tomatoes", quantity: 3))
        harness.kitchen.context.insert(PantryItem(name: "Salt"))
        harness.kitchen.context.insert(PantryItem(name: "Basil", quantity: 0))

        let page = try await harness.client.pantryFeed(Community.FeedQuery(tag: "dinner"))
        #expect(page.items.map(\.id) == ["all", "most", "half", "none"])
        #expect(page.cursor == nil)
        #expect(page.items[1].pantry == Community.PantryMatch(have: 2, total: 3, missing: ["Basil"]))
        #expect(stub.requests.map { $0.query["limit"] } == ["50", "50"])
        #expect(stub.requests.allSatisfy { $0.query["tag"] == "dinner" })

        // Ordinary pages carry the device's match too, and the detail.
        let feed = try await harness.client.feed()
        #expect(feed.items.map { $0.pantry?.have } == [0, 1])
        #expect(harness.client.pantryMatch(for: listing("x", ["Salt", "Pepper"])) == Community.PantryMatch(have: 1, total: 2, missing: ["Pepper"]))

        // The pager shows the same single page.
        let pager = CommunityFeedPager(client: harness.client, source: .pantry(Community.FeedQuery()))
        await pager.loadFirstPage()
        #expect(pager.listings.map(\.id) == ["all", "most", "half", "none"])
        #expect(!pager.hasMore)
    }

    @Test func leavesTheMatchToAServer() {
        let server = FakeKitchenServer { _, _ in throw FakeKitchenServer.unknown }
        let harness = CommunityHarness(server: server)
        harness.kitchen.context.insert(PantryItem(name: "Salt"))
        #expect(harness.client.pantryMatch(for: listing("x", ["Salt"])) == nil)
        var matched = listing("x", ["Salt"])
        matched.pantry = Community.PantryMatch(have: 0, total: 1, missing: ["Salt"])
        #expect(harness.client.pantryMatch(for: matched)?.have == 0)
    }
}

// MARK: Saved copies and update notices

@MainActor struct CommunityUpdateTests {
    @Test func remembersSavedCopiesAcrossLaunches() {
        let defaults = CommunityHarness.isolatedDefaults()
        let copies = CommunitySavedCopies(defaults: defaults)
        let (soup, salad) = (UUID(), UUID())
        copies.record(recipe: soup, remoteID: "r1", revision: 3, origin: "https://a.example.test")
        copies.record(recipe: salad, remoteID: "r2", revision: 1, origin: "https://b.example.test")
        copies.dismiss(recipe: soup, revision: 4)

        let relaunched = CommunitySavedCopies(defaults: defaults)
        #expect(relaunched.copy(for: soup) == SavedCommunityCopy(remoteID: "r1", revision: 3, origin: "https://a.example.test", dismissedRevision: 4))
        #expect(relaunched.recipe(forRemoteID: "r2", origin: "https://b.example.test") == salad)
        #expect(relaunched.recipe(forRemoteID: "r2", origin: "https://a.example.test") == nil)

        relaunched.prune(keeping: [salad])
        #expect(CommunitySavedCopies(defaults: defaults).copies.keys.map { $0 } == [salad])
        relaunched.forget(recipe: salad)
        #expect(CommunitySavedCopies(defaults: defaults).copies.isEmpty)
    }

    @Test func comparesCommunityAddressesLoosely() {
        #expect(CommunityService.originKey(URL(string: "https://Example.Convex.site/")!) == "https://example.convex.site")
        #expect(CommunityService.originKey("https://example.convex.site") == "https://example.convex.site")
        #expect(CommunityService.originKey(URL(string: "https://example.test:8443/community/")!) == "https://example.test:8443/community")
    }

    @Test func offersAppliesAndDismissesUpdates() async throws {
        let revision = Shared(3)
        let stub = CommunityStub { request in
            let title = revision.value == 3 ? "Tomato soup" : "Tomato soup v\(revision.value)"
            switch (request.method, request.path) {
            case ("GET", "/api/v2/recipes"): return .json(["recipes": [Fixture.listing(title: title, revision: revision.value)], "cursor": NSNull()])
            case ("GET", "/api/v2/recipes/r1"): return .json(Fixture.detail(title: title, revision: revision.value, inlinePhoto: request.query["photo"] == "inline"))
            case ("GET", "/api/v2/revisions"): return .json(["revisions": ["r1": revision.value, "gone": NSNull()]])
            case ("POST", "/api/v2/save"): return .json(["saveCount": 3])
            default: return .error(404, "Not found")
            }
        }
        let harness = CommunityHarness(stub: stub)
        let (client, kitchen) = (harness.client, harness.kitchen)
        #expect(try await client.feed().items.first?.saved == false)

        // Saving makes a normal recipe and remembers where it came from.
        let saved = try await client.save(recipeID: "r1")
        let recipe = try #require(saved.recipe)
        #expect(saved.saveCount == 3)
        #expect(recipe.title == "Tomato soup")
        #expect(recipe.summary == "Cozy")
        #expect(recipe.tags == ["dinner"])
        #expect(recipe.servings == 4 && recipe.totalTimeMinutes == 30)
        #expect(recipe.sourceURL == "https://example.test/soup")
        #expect(recipe.communityAuthor == "Bea")
        #expect(recipe.photo == Community.dataURLBytes(Fixture.photo))
        #expect(recipe.ingredients.map(\.name) == ["Tomatoes", "Salt"])
        #expect(recipe.ingredients[0].quantity == 800 && recipe.ingredients[0].unit == "g" && recipe.ingredients[0].note == "ripe")
        #expect(recipe.steps.map(\.text) == ["Simmer Tomato soup."])
        #expect(recipe.needsPush)
        #expect(stub.last("GET", "/api/v2/recipes/r1")?.query == ["photo": "inline"])
        #expect(stub.last("POST", "/api/v2/save")?.json["clientKey"] as? String == CommunityInstall.clientKey(purpose: "save", defaults: harness.defaults))
        #expect(client.copies.copy(for: recipe.uuid) == SavedCommunityCopy(remoteID: "r1", revision: 3, origin: CommunityService.originKey(stub.base), dismissedRevision: nil))
        // Stored in UserDefaults only: a new launch still knows.
        #expect(CommunitySavedCopies(defaults: harness.defaults).copy(for: recipe.uuid)?.remoteID == "r1")

        #expect(client.savedRecipe(forRemoteID: "r1") === recipe)
        #expect(try await client.feed().items.first?.saved == true)
        #expect(try await client.detail(id: "r1").savedRecipeId == recipe.uuid.uuidString)
        #expect(try await client.save(recipeID: "r1").recipe === recipe)
        #expect(kitchen.fetch(Recipe.self).count == 1)
        #expect(stub.count("/api/v2/save") == 1)

        // Same revision: nothing to offer.
        #expect(try await client.checkForUpdates().isEmpty)
        #expect(stub.last("GET", "/api/v2/revisions")?.query == ["ids": "r1"])

        // The person's own additions, which an update must keep.
        recipe.notes = "Use the big pot"
        recipe.favorited = true
        var ingredients = recipe.ingredients
        ingredients[0].mappingLabel = "Canned tomatoes"
        recipe.ingredients = ingredients

        revision.value = 4
        var updates = try await client.checkForUpdates()
        #expect(updates == [Community.Update(recipeId: recipe.uuid.uuidString, title: "Tomato soup", remoteId: "r1", savedRevision: 3, latestRevision: 4)])
        #expect(client.pendingUpdates == updates)
        #expect(client.recipe(for: updates[0]) === recipe)

        // Dismissed: revision 4 isn't offered again, revision 5 is.
        try await client.dismissUpdate(updates[0])
        #expect(client.pendingUpdates.isEmpty)
        #expect(try await client.checkForUpdates().isEmpty)
        #expect(recipe.title == "Tomato soup")
        revision.value = 5
        updates = try await client.checkForUpdates()
        #expect(updates.map(\.latestRevision) == [5])
        #expect(updates.map(\.savedRevision) == [3])

        // Applied: the community's fields are replaced through the normal save.
        recipe.needsPush = false
        try await client.applyUpdate(updates[0])
        #expect(recipe.title == "Tomato soup v5")
        #expect(recipe.steps.map(\.text) == ["Simmer Tomato soup v5."])
        #expect(recipe.ingredients.map(\.name) == ["Tomatoes", "Salt"])
        #expect(recipe.ingredients[0].mappingLabel == "Canned tomatoes")
        #expect(recipe.notes == "Use the big pot")
        #expect(recipe.favorited)
        #expect(recipe.photo == Community.dataURLBytes(Fixture.photo))
        #expect(recipe.needsPush)
        #expect(kitchen.fetch(Recipe.self).count == 1)
        #expect(client.copies.copy(for: recipe.uuid) == SavedCommunityCopy(remoteID: "r1", revision: 5, origin: CommunityService.originKey(stub.base), dismissedRevision: nil))
        #expect(client.pendingUpdates.isEmpty)
        #expect(try await client.checkForUpdates().isEmpty)

        // A deleted recipe is forgotten, and can be saved afresh.
        revision.value = 6
        let update = Community.Update(recipeId: recipe.uuid.uuidString, title: "", remoteId: "r1", savedRevision: 5, latestRevision: 6)
        kitchen.delete(recipe)
        kitchen.changed()
        let revisionChecks = stub.count("/api/v2/revisions")
        #expect(try await client.checkForUpdates().isEmpty)
        #expect(client.copies.copies.isEmpty)
        #expect(CommunitySavedCopies(defaults: harness.defaults).copies.isEmpty)
        #expect(stub.count("/api/v2/revisions") == revisionChecks)
        await #expect(throws: CommunityError.notFound) { try await client.applyUpdate(update) }
        #expect(try await client.feed().items.first?.saved == false)
        #expect(try await client.save(recipeID: "r1").recipe?.title == "Tomato soup v6")
    }

    @Test func onlyAsksAboutCopiesFromTheCommunityInUse() async throws {
        let stub = CommunityStub()
        let harness = CommunityHarness(stub: stub)
        let recipe = harness.kitchen.save(RecipeDraft(title: "From elsewhere"))
        harness.client.copies.record(recipe: recipe.uuid, remoteID: "x1", revision: 1, origin: "https://elsewhere.example.test")
        #expect(try await harness.client.checkForUpdates().isEmpty)
        #expect(stub.count("/api/v2/revisions") == 0)
        #expect(harness.client.copies.copies.count == 1)
    }
}

// MARK: Client key, links, photos

@MainActor struct CommunityIdentityTests {
    @Test func clientKeyIsStableHashedAndPerPurpose() {
        let defaults = CommunityHarness.isolatedDefaults()
        let key = CommunityInstall.clientKey(purpose: "save", defaults: defaults)
        #expect(key.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil)
        #expect(CommunityInstall.clientKey(purpose: "save", defaults: defaults) == key)
        #expect(CommunityInstall.clientKey(purpose: "report", defaults: defaults) != key)
        // Never the raw identifier, and different on another install.
        let identifier = defaults.string(forKey: CommunityInstall.identifierKey) ?? ""
        #expect(!identifier.isEmpty)
        #expect(!key.contains(identifier))
        #expect(CommunityInstall.clientKey(purpose: "save", defaults: CommunityHarness.isolatedDefaults()) != key)
    }

    @Test func parsesRecipeLinks() {
        func id(_ text: String) -> String? { URL(string: text).flatMap(CommunityLink.recipeID) }
        #expect(id("https://souschefkitchen.app/r/k57abc123") == "k57abc123")
        #expect(id("https://souschefkitchen.app/r/k57abc123/") == "k57abc123")
        #expect(id("https://SousChefKitchen.app/r/k57abc123?utm_source=share#top") == "k57abc123")
        #expect(id("https://souschefkitchen.app:443/r/a%20b") == "a b")

        #expect(id("http://souschefkitchen.app/r/k57abc123") == nil)
        #expect(id("https://www.souschefkitchen.app/r/k57abc123") == nil)
        #expect(id("https://souschefkitchen.app.evil.test/r/k57abc123") == nil)
        #expect(id("https://evil.test/r/k57abc123") == nil)
        #expect(id("https://user@souschefkitchen.app/r/k57abc123") == nil)
        #expect(id("https://souschefkitchen.app:8443/r/k57abc123") == nil)
        #expect(id("https://souschefkitchen.app/r/") == nil)
        #expect(id("https://souschefkitchen.app/r") == nil)
        #expect(id("https://souschefkitchen.app/r/a/b") == nil)
        #expect(id("https://souschefkitchen.app/r/a%2Fb") == nil)
        #expect(id("https://souschefkitchen.app/r/..") == nil)
        #expect(id("https://souschefkitchen.app/recipes/k57abc123") == nil)
        #expect(id("https://souschefkitchen.app/R/k57abc123") == nil)
        #expect(id("https://souschefkitchen.app/x/r/k57abc123") == nil)
        #expect(id("https://souschefkitchen.app/community-guidelines/") == nil)
        #expect(id("souschef://r/k57abc123") == nil)

        #expect(CommunityLink.url(forRecipeID: "k57abc123")?.absoluteString == "https://souschefkitchen.app/r/k57abc123")
        #expect(CommunityLink.url(forRecipeID: "a b").flatMap(CommunityLink.recipeID) == "a b")
    }

    private func jpeg(width: Int, height: Int) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).jpegData(withCompressionQuality: 0.8) { context in
            UIColor.systemOrange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    @Test func loadsDownsamplesAndCachesPhotos() async throws {
        let photo = jpeg(width: 800, height: 400)
        let stub = CommunityStub { request in
            request.path == "/p.jpg" ? StubResponse(status: 200, body: photo, contentType: "image/jpeg") : .error(404, "Not found")
        }
        let loader = CommunityImageLoader(session: stub.session)
        let url = stub.base.appending(path: "p.jpg").absoluteString
        #expect(loader.cached(url, maxPixel: 200) == nil)

        let image = try #require(await loader.image(for: url, maxPixel: 200))
        #expect(max(image.size.width * image.scale, image.size.height * image.scale) == 200)
        #expect(min(image.size.width * image.scale, image.size.height * image.scale) == 100)
        #expect(stub.requests.count == 1)
        #expect(stub.requests[0].authorization == nil)

        // In memory from now on; another size is its own entry.
        #expect(loader.cached(url, maxPixel: 200) === image)
        #expect(await loader.image(for: url, maxPixel: 200) === image)
        #expect(stub.requests.count == 1)
        #expect(loader.cached(url, maxPixel: 400) == nil)

        // Inline photos from a community without v2 still load.
        let inline = "data:image/jpeg;base64," + photo.base64EncodedString()
        let decoded = try #require(await loader.image(for: inline, maxPixel: 100))
        #expect(max(decoded.size.width * decoded.scale, decoded.size.height * decoded.scale) == 100)
        #expect(loader.cached(inline, maxPixel: 100) === decoded)
        #expect(stub.requests.count == 1)

        // Missing, broken, insecure and absent photos are simply nil.
        #expect(await loader.image(for: stub.base.appending(path: "missing.jpg").absoluteString) == nil)
        #expect(await loader.image(for: "http://\(stub.host)/p.jpg") == nil)
        #expect(await loader.image(for: "data:image/jpeg;base64,bm90IGFuIGltYWdl") == nil)
        #expect(await loader.image(for: nil) == nil)
        #expect(await loader.image(for: "") == nil)
        #expect(stub.requests.count == 2)
    }

    @Test func aCancelledPhotoLoadReturnsNothing() async {
        let photo = jpeg(width: 64, height: 64)
        let stub = CommunityStub { _ in StubResponse(status: 200, body: photo, contentType: "image/jpeg") }
        let loader = CommunityImageLoader(session: stub.session)
        let url = stub.base.appending(path: "p.jpg").absoluteString
        let task = Task { await loader.image(for: url, maxPixel: 64) }
        task.cancel()
        #expect(await task.value == nil)
        #expect(loader.cached(url, maxPixel: 64) == nil)
    }
}
