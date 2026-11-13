import Foundation
import Testing
@testable import SousChef

/// What the 1.3.0 release review found: numbers no recipe should carry, the
/// server kitchen on screen, saved copies that were deleted, feeds whose
/// pages are all hidden, the report note's length and reported tips.

private func decode<T: Decodable>(_ type: T.Type, _ object: Any) throws -> T {
    try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object))
}

private func decode<T: Decodable>(_ type: T.Type, json: String) throws -> T {
    try JSONDecoder().decode(T.self, from: Data(json.utf8))
}

/// Numbers a hostile publication, community or server could send.
private nonisolated enum Hostile {
    static var listing: [String: Any] { [
        "revision": -7, "servings": 1e100, "totalTimeMinutes": -5, "likeCount": -3, "saveCount": 1e100, "madeCount": 2.4, "rating": 1e100,
        "pantry": ["have": 1e100, "total": -2, "missing": ["Salt"]],
    ] }

    static var snapshot: [String: Any] { [
        "version": 1, "title": "Soup", "servings": 1e100, "totalTimeMinutes": 1e300,
        "ingredients": [["name": "Tomatoes", "quantity": 1e100, "unit": "g"], ["name": "Salt", "quantity": -5], ["name": "Basil", "quantity": 2],
                        ["name": "Oil", "quantity": "a lot"]],
        "steps": [["text": "Cook."]],
    ] }

    static var detail: [String: Any] {
        var extra = listing
        extra["snapshot"] = snapshot
        extra["tips"] = [["id": "t1", "author": ["id": "u3", "name": "Cy"], "rating": 1e100, "tip": "Add basil", "createdAt": "2026-11-03T10:00:00Z"],
                         ["id": "t2", "author": ["id": "u4", "name": "Di"], "rating": -5, "tip": "Less salt", "createdAt": "2026-11-03T10:00:00Z"]]
        extra["viewer"] = ["liked": true, "following": false, "own": false, "made": ["rating": 1e100, "tip": "Nice"]]
        return Fixture.detail(extra: extra)
    }

    /// A recipe as a community from before v2 publishes it.
    static var publication: [String: Any] { [
        "id": "old1", "revision": 1e100, "author": ["id": "u2", "name": "Bea"], "createdAt": "2026-10-01T10:00:00Z",
        "snapshot": ["version": 1, "title": "Old soup", "servings": 1e100, "totalTimeMinutes": -5,
                     "ingredients": [["name": "Tomatoes", "quantity": 1e100], ["name": "Salt", "quantity": -1]], "steps": [["text": "Cook."]]],
    ] }

    /// The same recipe as a server from before 1.3.0 lists it.
    static var legacyRecipe: [String: Any] { [
        "id": "old1", "title": "Old soup", "servings": 1e100, "totalTimeMinutes": -5, "author": ["id": "u2", "name": "Bea"],
        "ingredients": [["name": "Tomatoes", "quantity": 1e100], ["name": "Salt", "quantity": -1]], "steps": [["text": "Cook."]],
    ] }

    @Sendable static func legacyRoute(_ request: StubRequest) -> StubResponse {
        switch (request.method, request.path) {
        case ("GET", "/api/v1/recipes"): .json(["recipes": [publication]])
        case ("GET", "/api/v1/recipes/old1"): .json(publication)
        default: .error(404, "Not found")
        }
    }
}

// MARK: Numbers

@MainActor struct CommunityHostileNumberTests {
    @Test func aListingDropsNumbersNoRecipeHas() throws {
        let listing = try decode(Community.Listing.self, Fixture.listing(extra: Hostile.listing))
        #expect(listing.servings == nil && listing.totalTimeMinutes == nil)
        #expect(listing.revision == 0 && listing.likeCount == 0 && listing.madeCount == 2)
        #expect(listing.saveCount == 1_000_000_000_000)
        #expect(listing.rating == 5)
        #expect(listing.pantry == Community.PantryMatch(have: 0, total: 0, missing: ["Salt"]))

        // Sane numbers are kept as they are, at both ends of what's allowed.
        let edges = try decode(Community.Listing.self, Fixture.listing(extra: ["servings": 100_000, "totalTimeMinutes": 1_000_000, "rating": 0]))
        #expect(edges.servings == 100_000 && edges.totalTimeMinutes == 1_000_000 && edges.rating == 0)
        let over = try decode(Community.Listing.self, Fixture.listing(extra: ["servings": 100_001, "totalTimeMinutes": 1_000_001, "rating": -1]))
        #expect(over.servings == nil && over.totalTimeMinutes == nil && over.rating == 0)
        let none = try decode(Community.Listing.self, Fixture.listing(extra: ["servings": 0, "totalTimeMinutes": 0.2]))
        #expect(none.servings == nil && none.totalTimeMinutes == nil)
        // A number that isn't one reads as missing.
        let text = try decode(Community.Listing.self, Fixture.listing(extra: ["servings": "four", "likeCount": "many", "revision": NSNull()]))
        #expect(text.servings == nil && text.likeCount == 0 && text.revision == 0)
    }

    @Test func exponentsBeyondADoubleAreDroppedToo() throws {
        let json = """
        {"id":"r1","author":{"id":"u2","name":"Bea"},"title":"Soup","servings":1e999,"totalTimeMinutes":-1e999,"likeCount":1E+400,"rating":1e999,
         "pantry":{"have":1e999,"total":1e999,"missing":[]}}
        """
        let beyond = try decode(Community.Listing.self, json: json)
        #expect(beyond.servings == nil && beyond.totalTimeMinutes == nil && beyond.rating == nil)
        #expect(beyond.likeCount == 0 && beyond.pantry?.total == 0)
        // Through a server the same text doesn't parse at all, which fails the request, not the app.
        #expect(throws: (any Error).self) { try JSONSerialization.jsonObject(with: Data(json.utf8)) }
        // The largest and smallest a Double holds decode, and are dropped.
        let extreme = """
        {"id":"r1","author":{"id":"u2","name":"Bea"},"title":"Soup","servings":1.7976931348623157e308,"totalTimeMinutes":-1.7976931348623157E+308,
         "likeCount":1e308,"saveCount":-1e308,"madeCount":4.9e-324,"rating":-1e308,"revision":99999999999999999999999999}
        """
        let listing = try decode(Community.Listing.self, json: extreme)
        #expect(listing.servings == nil && listing.totalTimeMinutes == nil)
        #expect(listing.likeCount == 1_000_000_000_000 && listing.saveCount == 0 && listing.madeCount == 0)
        #expect(listing.rating == 0)
        #expect(listing.revision == 1_000_000_000_000)
    }

    @Test func aDetailDropsNumbersNoRecipeHas() throws {
        let detail = try decode(Community.Detail.self, Hostile.detail)
        #expect(detail.servings == nil && detail.totalTimeMinutes == nil)
        #expect(detail.snapshot.servings == nil && detail.snapshot.totalTimeMinutes == nil)
        #expect(detail.snapshot.ingredients.map(\.quantity) == [nil, nil, 2, nil])
        #expect(detail.tips.map(\.rating) == [5, 0])
        #expect(detail.viewer?.made?.rating == 5)
    }

    @Test func resultsAndCountsNeverGoNegative() throws {
        #expect(try decode(Community.LikeResult.self, ["liked": true, "likeCount": -4]) == .init(liked: true, likeCount: 0))
        #expect(try decode(Community.MadeResult.self, ["madeCount": 1e100, "rating": 1e100]) == .init(madeCount: 1_000_000_000_000, rating: 5))
        #expect(try decode(Community.MadeResult.self, ["madeCount": -1]) == .init(madeCount: 0, rating: nil))
        #expect(try decode(Community.FollowResult.self, ["following": false, "followerCount": -1e100]) == .init(following: false, followerCount: 0))
        #expect(try decode(Community.TagCount.self, ["tag": "dinner", "count": -12]).count == 0)
        let cook = try decode(Community.Cook.self, ["id": "u2", "name": "Bea", "recipeCount": -1, "followerCount": 1e100, "followingCount": 3])
        #expect((cook.recipeCount, cook.followerCount, cook.followingCount) == (0, 1_000_000_000_000, 3))
        let update = try decode(Community.Update.self, ["recipeId": "srv1", "title": "Soup", "remoteId": "r1", "savedRevision": -1, "latestRevision": 1e100])
        #expect(update.savedRevision == 0 && update.latestRevision == 1_000_000_000_000)
    }

    @Test func theV1ShapeDropsThemToo() throws {
        let publication = try decode(DTO.CommunityPublication.self, Hostile.publication)
        let listing = Community.Listing(legacy: publication.recipe)
        #expect(listing.servings == nil && listing.totalTimeMinutes == nil)
        let detail = Community.Detail(legacy: publication.recipe, revision: -3)
        #expect(detail.revision == 0)
        #expect(detail.snapshot.servings == nil && detail.snapshot.totalTimeMinutes == nil)
        #expect(detail.snapshot.ingredients.map(\.quantity) == [nil, nil])

        let recipe = try decode(DTO.CommunityRecipe.self, Hostile.legacyRecipe)
        #expect(Community.Listing(legacy: recipe).servings == nil)
        #expect(Community.Detail(legacy: recipe).snapshot.ingredients.map(\.quantity) == [nil, nil])
    }

    @Test func wordingSurvivesAnyNumber() {
        for minutes in [1e100, -1e100, .infinity, -.infinity, .nan, 0, -5, 1e19, .greatestFiniteMagnitude] {
            #expect(!CommunityText.time(minutes: minutes).isEmpty)
        }
        #expect(CommunityText.time(minutes: 90) == CommunityText.time(minutes: 90.2))
        #expect(CommunityText.time(minutes: 1e100) == CommunityText.time(minutes: 1_000_000))
        for value in [1e100, -1e100, Double.infinity, .nan] {
            #expect(Community.whole(value) == nil)
            #expect(!CommunityText.rating(value).isEmpty)
            #expect(!Units.amount(value.isFinite ? abs(value) : nil, "g").isEmpty)
        }
        #expect(Community.whole(3.6) == 4)
        #expect(Community.servings(.nan) == nil && Community.minutes(.infinity) == nil && Community.quantity(.nan) == nil)
        #expect(Community.count(.nan) == 0 && Community.count(.infinity) == 0 && Community.rating(.nan) == nil)
        #expect(!CommunityText.count(.max, "like").isEmpty && !CommunityText.count(.min, "like").isEmpty)

        // A listing built in the app, not decoded, with numbers nothing checked.
        let listing = Community.Listing(id: "r1", revision: 1, createdAt: "", updatedAt: "", author: .init(id: "u2", name: "Bea"), title: "Soup", tags: [],
                                        servings: 1e100, totalTimeMinutes: 1e100, ingredientNames: [], likeCount: .max, saveCount: 0, madeCount: .max, rating: .nan)
        #expect(CommunityText.summary(of: listing, social: true, saved: true, pantry: .init(have: .max, total: .max, missing: [])).contains("Soup"))
    }

    @Test func savingAndUpdatingARecipeWithSuchNumbersWorks() async throws {
        let revision = Shared(3)
        let stub = CommunityStub { request in
            switch (request.method, request.path) {
            case ("GET", "/api/v2/recipes"): return .json(["recipes": [Fixture.listing(extra: Hostile.listing)], "cursor": NSNull()])
            case ("GET", "/api/v2/recipes/r1"):
                var detail = Hostile.detail
                detail["revision"] = revision.value
                return .json(detail)
            case ("GET", "/api/v2/revisions"): return .json(["revisions": ["r1": revision.value]])
            case ("POST", "/api/v2/save"): return .json(["saveCount": -1e100])
            default: return .error(404, "Not found")
            }
        }
        let harness = CommunityHarness(stub: stub)
        let client = harness.client
        #expect(try await client.feed().items.first?.servings == nil)

        let saved = try await client.save(recipeID: "r1")
        let recipe = try #require(saved.recipe)
        #expect(recipe.servings == nil && recipe.totalTimeMinutes == nil)
        #expect(recipe.ingredients.map(\.quantity) == [nil, nil, 2, nil])

        // The person's own numbers give way to the update's, which has none.
        recipe.servings = 4
        recipe.totalTimeMinutes = 30
        revision.value = 4
        let update = try #require(try await client.checkForUpdates().first)
        try await client.applyUpdate(update)
        #expect(recipe.servings == nil && recipe.totalTimeMinutes == nil)
        #expect(recipe.ingredients.map(\.quantity) == [nil, nil, 2, nil])

        // The page model reads the same recipe without trouble.
        let model = CommunityRecipeModel(id: "r1", preview: nil, client: client, social: CommunitySocial(client: client))
        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.tips.map(\.rating) == [5, 0])
    }

    @Test func aCommunityFromBeforeV2CanSendThemToo() async throws {
        let harness = CommunityHarness(stub: CommunityStub(Hostile.legacyRoute))
        let client = harness.client
        let page = try await client.feed()
        #expect(client.level == .legacy)
        #expect(page.items.map(\.id) == ["old1"])
        #expect(page.items[0].servings == nil && page.items[0].totalTimeMinutes == nil)
        let detail = try await client.detail(id: "old1")
        #expect(detail.revision == 0)
        #expect(detail.snapshot.ingredients.map(\.quantity) == [nil, nil])
        let recipe = try #require(try await client.save(recipeID: "old1").recipe)
        #expect(recipe.servings == nil && recipe.totalTimeMinutes == nil)
        #expect(recipe.ingredients.map(\.quantity) == [nil, nil])
    }

    @Test func aServerFromBefore1_3CanSendThemToo() async throws {
        let server = FakeKitchenServer { path, _ in
            switch path {
            case "community:listRecipes": return ["available": true, "recipes": [Hostile.legacyRecipe]]
            case "community:getRecipe": return Hostile.legacyRecipe
            default: throw FakeKitchenServer.unknown
            }
        }
        let client = CommunityHarness(server: server).client
        let page = try await client.feed()
        #expect(page.items[0].servings == nil && page.items[0].totalTimeMinutes == nil)
        #expect(try await client.detail(id: "old1").snapshot.ingredients.map(\.quantity) == [nil, nil])
    }
}

// MARK: The server kitchen on screen

@MainActor struct CommunityHouseholdTests {
    /// A 1.3.0 server.
    private func server() -> FakeKitchenServer {
        FakeKitchenServer { path, args in
            let kitchen = args["householdId"] as? String ?? "current"
            switch path {
            case "community:feed", "community:followingFeed":
                return ["recipes": [Fixture.listing(title: "Soup in \(kitchen)", extra: ["saved": kitchen == "h1"])], "cursor": NSNull(), "available": true]
            case "community:recipe": return Fixture.detail(inlinePhoto: false, extra: ["saved": kitchen == "h1", "savedRecipeId": "srv-\(kitchen)"])
            case "community:tips": return ["tips": [[String: Any]](), "cursor": NSNull()]
            case "community:tags": return ["tags": [["tag": "dinner", "count": 12]]]
            case "community:cook": return ["id": "u2", "name": "Bea", "recipeCount": 7, "followerCount": 1, "followingCount": 0, "blocked": false]
            case "community:me": return ["configured": true, "connected": true, "me": Fixture.me]
            case "community:like": return ["liked": true, "likeCount": 6]
            case "community:updates":
                return ["updates": [["recipeId": "srv-\(kitchen)", "title": "Soup in \(kitchen)", "remoteId": "r1", "savedRevision": 3, "latestRevision": 4]]]
            case "community:saveRecipe": return ["savedRecipeId": "srv-\(kitchen)"]
            case "community:applyUpdate", "community:dismissUpdate", "community:report", "community:hide": return ["success": true]
            default: throw FakeKitchenServer.unknown
            }
        }
    }

    @Test func everyKitchenDependentOperationNamesTheKitchenOnScreen() async throws {
        let server = server()
        let household = Shared<String?>("h1")
        let client = CommunityHarness(server: server, household: household).client
        #expect(client.householdID == "h1")

        _ = try await client.feed(Community.FeedQuery(sort: .top), cursor: "c1")
        // The server was asked what it supports before it was sent the argument.
        #expect(server.calls.map(\.path) == ["community:tags", "community:feed"])
        #expect(server.calls[0].args.isEmpty)
        #expect(server.last("community:feed")?["householdId"] as? String == "h1")
        #expect(server.last("community:feed")?["sort"] as? String == "top")

        _ = try await client.pantryFeed()
        #expect(server.last("community:feed")?["pantry"] as? Bool == true)
        #expect(server.last("community:feed")?["householdId"] as? String == "h1")
        _ = try await client.followingFeed()
        #expect(server.last("community:followingFeed")?["householdId"] as? String == "h1")
        _ = try await client.detail(id: "r1")
        #expect(server.last("community:recipe")?["householdId"] as? String == "h1")
        #expect(server.last("community:recipe")?["id"] as? String == "r1")
        _ = try await client.save(recipeID: "r1")
        #expect(server.last("community:saveRecipe")?["householdId"] as? String == "h1")
        #expect(server.last("community:saveRecipe")?["recipeId"] as? String == "r1")
        let updates = try await client.checkForUpdates()
        #expect(server.last("community:updates")?["householdId"] as? String == "h1")
        try await client.applyUpdate(updates[0])
        #expect(server.last("community:applyUpdate")?["householdId"] as? String == "h1")
        #expect(server.last("community:applyUpdate")?["recipeId"] as? String == "srv-h1")
        try await client.dismissUpdate(updates[0])
        #expect(server.last("community:dismissUpdate")?["householdId"] as? String == "h1")

        // The kitchen the app switched to, from then on.
        household.value = "h2"
        #expect(try await client.feed().items.first?.title == "Soup in h2")
        #expect(server.last("community:feed")?["householdId"] as? String == "h2")
        #expect(try await client.detail(id: "r1").savedRecipeId == "srv-h2")
        #expect(try await client.save(recipeID: "r1").serverRecipeID == "srv-h2")
        #expect(try await client.checkForUpdates().map(\.recipeId) == ["srv-h2"])

        // Operations that don't depend on the kitchen stay as they were.
        _ = try await client.tips(recipeID: "r1")
        _ = try await client.cook(id: "u2")
        _ = try await client.like(recipeID: "r1", liked: true)
        _ = try await client.report(recipeID: "r1", title: "Soup", reason: .spam)
        _ = try await client.accountStatus()
        for path in ["community:tips", "community:tags", "community:cook", "community:like", "community:report", "community:me"] {
            #expect(server.last(path)?["householdId"] == nil, "\(path)")
        }
        #expect(server.count("community:tags") == 1)
    }

    @Test func savingFirstAsksWhatTheServerSupports() async throws {
        let server = server()
        let client = CommunityHarness(server: server, household: Shared("h1")).client
        _ = try await client.save(recipeID: "r1")
        #expect(server.calls.map(\.path) == ["community:tags", "community:saveRecipe"])
        #expect(server.last("community:saveRecipe")?["householdId"] as? String == "h1")
    }

    @Test func withoutAKitchenNothingIsAdded() async throws {
        let server = server()
        let client = CommunityHarness(server: server, household: Shared("")).client
        #expect(client.householdID == nil)
        _ = try await client.feed()
        _ = try await client.save(recipeID: "r1")
        #expect(server.calls.map(\.path) == ["community:feed", "community:saveRecipe"])
        #expect(server.calls.allSatisfy { $0.args["householdId"] == nil })
    }

    @Test func aServerFromBefore1_3IsNeverSentTheKitchen() async throws {
        // Like the real thing, it refuses arguments it doesn't know.
        func old() -> FakeKitchenServer {
            FakeKitchenServer { path, args in
                switch path {
                case "community:listRecipes", "community:getRecipe", "community:saveRecipe", "community:connection":
                    if args["householdId"] != nil { throw ServerClient.ServerError.server("Invalid value") }
                default: throw FakeKitchenServer.unknown
                }
                switch path {
                case "community:listRecipes": return ["available": true, "recipes": [Hostile.legacyRecipe]]
                case "community:getRecipe": return Hostile.legacyRecipe
                case "community:saveRecipe": return ["savedRecipeId": "srv1"]
                default: return ["configured": true, "connected": false]
                }
            }
        }
        let server = old()
        let client = CommunityHarness(server: server, household: Shared("h1")).client
        #expect(try await client.feed().items.map(\.id) == ["old1"])
        #expect(client.level == .legacy)
        #expect(try await client.pantryFeed().items.count == 1)
        #expect(try await client.detail(id: "old1").id == "old1")
        #expect(try await client.save(recipeID: "old1").serverRecipeID == "srv1")
        #expect(try await client.checkForUpdates().isEmpty)
        await #expect(throws: CommunityError.unsupported) { try await client.followingFeed() }
        // Not on the old operations, and not on the new ones it was tried with either.
        #expect(server.calls.allSatisfy { $0.args["householdId"] == nil })
        #expect(server.last("community:listRecipes")?.count == 2)
        #expect(server.last("community:saveRecipe")?.count == 1)
        #expect(server.count("community:feed") == 0)

        // Saving or opening a recipe before anything else finds out the same way.
        let saving = old()
        _ = try await CommunityHarness(server: saving, household: Shared("h1")).client.save(recipeID: "old1")
        #expect(saving.calls.map(\.path) == ["community:tags", "community:saveRecipe"])
        #expect(saving.calls.allSatisfy { $0.args["householdId"] == nil })
        let opening = old()
        _ = try await CommunityHarness(server: opening, household: Shared("h1")).client.detail(id: "old1")
        #expect(opening.calls.map(\.path) == ["community:tags", "community:getRecipe"])
        #expect(opening.calls.allSatisfy { $0.args["householdId"] == nil })
    }

    @Test func directRequestsCarryNoKitchen() async throws {
        let stub = CommunityStub()
        // A kitchen ID left over from a server that isn't connected any more.
        let client = CommunityHarness(stub: stub, household: Shared("h1")).client
        #expect(client.householdID == nil)
        _ = try await client.feed()
        _ = try await client.detail(id: "r1")
        _ = try await client.save(recipeID: "r1")
        #expect(stub.requests.allSatisfy { $0.query["householdId"] == nil && $0.json["householdId"] == nil })
    }

    @Test func switchingKitchensDropsTheUpdateNotices() async throws {
        let server = server()
        let household = Shared<String?>("h1")
        let client = CommunityHarness(server: server, household: household).client
        #expect(try await client.checkForUpdates().map(\.recipeId) == ["srv-h1"])
        #expect(client.pendingUpdates.map(\.recipeId) == ["srv-h1"])

        household.value = "h2"
        // At once, before anything is asked again.
        #expect(client.pendingUpdates.isEmpty)
        try await client.checkForUpdates()
        #expect(client.pendingUpdates.map(\.recipeId) == ["srv-h2"])
        // Back in the first kitchen its old notices don't come back either.
        household.value = "h1"
        #expect(client.pendingUpdates.isEmpty)
    }

    /// A server whose update check can be held open.
    private final class SlowServer: KitchenCalling {
        let inner: FakeKitchenServer
        let gate = Gate()
        var holding = false
        var baseURL: URL { inner.baseURL }

        init(_ inner: FakeKitchenServer) { self.inner = inner }

        func call(_ path: String, _ args: [String: Any]) async throws -> Any {
            if holding, path == "community:updates" { await gate.wait() }
            return try await inner.call(path, args)
        }
    }

    @Test func anAnswerForTheKitchenLeftBehindIsNotShown() async throws {
        let server = SlowServer(server())
        let household = Shared<String?>("h1")
        let defaults = CommunityHarness.isolatedDefaults()
        let client = CommunityClient(kitchen: Kitchen(inMemory: true),
                                     account: CommunityAccount(store: MemorySecretStore(), defaults: defaults, observeRevocation: false),
                                     moderation: CommunityModeration(defaults: defaults), defaults: defaults,
                                     communityURL: { nil }, companion: { server }, sync: {}, household: { household.value })
        _ = try await client.feed()
        server.holding = true
        let check = Task { try await client.checkForUpdates() }
        await eventually { server.gate.waiting == 1 }
        household.value = "h2"
        server.gate.open()
        // The server answered for h1, where the person no longer is.
        #expect(try await check.value.map(\.recipeId) == ["srv-h1"])
        #expect(client.pendingUpdates.isEmpty)
    }

    @Test func theCheckerLooksAgainRightAfterASwitch() async {
        let server = server()
        let household = Shared<String?>("h1")
        let harness = CommunityHarness(server: server, household: household)
        harness.moderation.acceptGuidelines()
        let checker = CommunityUpdateChecker(client: harness.client, interval: 600)
        let start = Date(timeIntervalSince1970: 4_000_000)
        await checker.checkIfDue(now: start)
        await checker.checkIfDue(now: start.addingTimeInterval(5))
        #expect(server.count("community:updates") == 1)
        household.value = "h2"
        await checker.checkIfDue(now: start.addingTimeInterval(10))
        #expect(server.count("community:updates") == 2)
        #expect(harness.client.pendingUpdates.map(\.recipeId) == ["srv-h2"])
        await checker.checkIfDue(now: start.addingTimeInterval(15))
        #expect(server.count("community:updates") == 2)
    }

    @Test func switchingKitchensStartsTheFeedOver() async throws {
        let server = server()
        let household = Shared<String?>("h1")
        let harness = CommunityHarness(server: server, household: household)
        let social = CommunitySocial(client: harness.client)
        let model = CommunityFeedModel(client: harness.client, social: social)
        await model.load()
        let before = model.loadKey
        #expect(model.pager.listings.map(\.title) == ["Soup in h1"])
        #expect(social.isSaved(model.pager.listings[0]))
        social.markSaved("r7")
        try await social.toggleLike(model.pager.listings[0])
        #expect(!social.likes.isEmpty)

        household.value = "h2"
        // The view reloads because the key changed.
        #expect(model.loadKey != before)
        #expect(social.identity.hasSuffix("@h2"))
        await model.load()
        #expect(model.pager.listings.map(\.title) == ["Soup in h2"])
        #expect(!social.isSaved(model.pager.listings[0]))
        #expect(social.saved.isEmpty && social.likes.isEmpty)
        #expect(server.last("community:feed")?["householdId"] as? String == "h2")
    }

    @Test func switchingKitchensClearsWhatARecipePageKnewAboutTheOldOne() async throws {
        let failing = Shared(false)
        let inner = server()
        let server = FakeKitchenServer { path, args in
            if failing.value, path == "community:recipe" { throw ServerClient.ServerError.unreachable }
            return try inner.handler(path, args)
        }
        let household = Shared<String?>("h1")
        let harness = CommunityHarness(server: server, household: household)
        let copy = Recipe(title: "Tomato soup")
        copy.serverID = "srv-h1"
        harness.kitchen.context.insert(copy)
        let social = CommunitySocial(client: harness.client)
        let preview = try decode(Community.Listing.self, Fixture.listing(extra: ["saved": true, "pantry": ["have": 1, "total": 2, "missing": ["Salt"]]]))
        let model = CommunityRecipeModel(id: "r1", preview: preview, client: harness.client, social: social)
        await model.load()
        #expect(model.isSaved && model.savedRecipe === copy)

        // The new kitchen's answer doesn't arrive; the old one's still goes.
        household.value = "h2"
        failing.value = true
        await model.load()
        #expect(!model.isSaved && model.savedRecipe == nil)
        #expect(model.detail?.savedRecipeId == nil && model.listing?.pantry == nil && model.preview?.saved == nil)

        failing.value = false
        await model.load()
        #expect(!model.isSaved)
        #expect(model.detail?.savedRecipeId == "srv-h2")
        #expect(server.last("community:recipe")?["householdId"] as? String == "h2")
    }
}

// MARK: Saved copies that were deleted

@MainActor struct CommunitySavedStateTests {
    @Test func aDeletedCopyCanBeSavedAgain() async throws {
        let stub = CommunityStub()
        let harness = CommunityHarness(stub: stub)
        let social = CommunitySocial(client: harness.client)
        let model = CommunityRecipeModel(id: "r1", preview: nil, client: harness.client, social: social)
        await model.load()
        let card = try #require(model.listing)
        #expect(!model.isSaved && !social.isSaved(card))

        try await model.save()
        let first = try #require(model.savedRecipe)
        #expect(model.isSaved && social.isSaved(card))

        // Deleted in Recipes, with the community page still open.
        harness.kitchen.delete(first)
        #expect(model.savedRecipe == nil)
        #expect(!model.isSaved)
        #expect(!social.isSaved(card))
        harness.kitchen.changed()
        #expect(!model.isSaved && !social.isSaved(card))
        // A listing loaded while the copy existed doesn't bring it back.
        var stale = card
        stale.saved = true
        #expect(!social.isSaved(stale))
        #expect(harness.client.copies.copies.isEmpty)

        try await model.save()
        let second = try #require(model.savedRecipe)
        #expect(second.uuid != first.uuid)
        #expect(model.isSaved && social.isSaved(card))
        #expect(harness.kitchen.fetch(Recipe.self).map(\.uuid) == [second.uuid])

        // Opening the page again agrees.
        harness.kitchen.delete(second)
        harness.kitchen.changed()
        let again = CommunityRecipeModel(id: "r1", preview: card, client: harness.client, social: social)
        await again.load()
        #expect(!again.isSaved && again.listing?.saved == false)
    }

    @Test func throughAServerItsAnswerDecides() async throws {
        let saved = Shared(false)
        let server = FakeKitchenServer { path, _ in
            switch path {
            case "community:recipe":
                return Fixture.detail(inlinePhoto: false, extra: saved.value ? ["saved": true, "savedRecipeId": "srv9"] : ["saved": false])
            case "community:feed": return ["recipes": [Fixture.listing(extra: ["saved": saved.value])], "cursor": NSNull(), "available": true]
            case "community:saveRecipe":
                saved.value = true
                return ["savedRecipeId": "srv9"]
            case "community:tags": return ["tags": [Any]()]
            case "community:me": return ["configured": true, "connected": true, "me": Fixture.me]
            default: throw FakeKitchenServer.unknown
            }
        }
        let harness = CommunityHarness(server: server)
        let social = CommunitySocial(client: harness.client)
        let feed = CommunityFeedModel(client: harness.client, social: social)
        await feed.load()
        let card = try #require(feed.pager.listings.first)
        let model = CommunityRecipeModel(id: "r1", preview: card, client: harness.client, social: social)
        await model.load()
        #expect(!model.isSaved)

        try await model.save()
        // The card was loaded before the save and still shows it.
        #expect(model.isSaved && social.isSaved(card))
        // Coming back to the tab reads nothing new, so the save stays remembered.
        await feed.load()
        #expect(social.isSaved(card))

        // The copy is deleted and the server knows: its answer replaces what was remembered.
        saved.value = false
        await model.load()
        #expect(!model.isSaved)
        #expect(!social.isSaved(card))
        #expect(social.saved.isEmpty)
        try await model.save()
        #expect(model.isSaved)
        #expect(server.count("community:saveRecipe") == 2)

        // A refreshed feed is the server's answer as well.
        saved.value = false
        await feed.refresh()
        #expect(social.saved.isEmpty)
        #expect(!social.isSaved(try #require(feed.pager.listings.first)))
    }
}

// MARK: A feed whose pages are all hidden

@MainActor struct CommunityStalledFeedTests {
    private func listing(_ id: String, author: String = "u2") -> Community.Listing {
        Community.Listing(id: id, revision: 1, createdAt: "", updatedAt: "", author: .init(id: author, name: "Bea"), title: "Soup", tags: [],
                          ingredientNames: [], likeCount: 0, saveCount: 0, madeCount: 0)
    }

    /// Pages 1…`hidden` hold a blocked cook's recipes only; the one after holds a recipe to show and ends the feed.
    private func pager(hidden: Int, first: [Community.Listing] = [], requests: Shared<Int>) -> CommunityFeedPager {
        let moderation = CommunityModeration(defaults: CommunityHarness.isolatedDefaults())
        moderation.setBlocked(true, author: .init(id: "u9", name: "Troll"))
        return CommunityFeedPager(moderation: moderation) { cursor in
            requests.value += 1
            let page = cursor.flatMap { Int($0) } ?? 0
            if page == 0, !first.isEmpty { return .init(items: first, cursor: "1") }
            if page >= hidden { return .init(items: [self.listing("shown")], cursor: nil) }
            return .init(items: [self.listing("hidden\(page)", author: "u9")], cursor: String(page + 1))
        }
    }

    @Test func anEmptyFeedWithMoreToReadOffersLoadMore() async {
        let requests = Shared(0)
        let pager = pager(hidden: 12, requests: requests)
        await pager.loadFirstPage()
        // Bounded: five pages, nothing to show, and the feed isn't over.
        #expect(requests.value == CommunityFeedPager.maxPagesPerLoad)
        #expect(pager.listings.isEmpty && pager.hasLoaded && !pager.isLoading && pager.error == nil)
        #expect(pager.hasMore && pager.isStalled)

        // "Load more" goes on from there, again bounded.
        await pager.loadMore()
        #expect(requests.value == 10)
        #expect(pager.listings.isEmpty && pager.hasMore && pager.isStalled)
        await pager.loadMore()
        #expect(requests.value == 13)
        #expect(pager.listings.map(\.id) == ["shown"])
        #expect(!pager.hasMore && !pager.isStalled)
    }

    @Test func aFeedThatStallsBelowItsRowsOffersLoadMoreToo() async {
        let requests = Shared(0)
        let pager = pager(hidden: 7, first: [listing("r1")], requests: requests)
        await pager.loadFirstPage()
        #expect(pager.listings.map(\.id) == ["r1"])
        #expect(pager.hasMore && !pager.isStalled)

        // The last row appearing asks once; no new row will ask again.
        await pager.loadMoreIfNeeded(after: listing("r1"))
        #expect(requests.value == 6)
        #expect(pager.listings.map(\.id) == ["r1"])
        #expect(pager.hasMore && pager.isStalled)
        await pager.loadMore()
        #expect(pager.listings.map(\.id) == ["r1", "shown"])
        #expect(!pager.hasMore && !pager.isStalled)
    }

    @Test func anEndedOrOrdinaryFeedIsNotStalled() async {
        let requests = Shared(0)
        let ended = pager(hidden: 3, requests: requests)
        await ended.loadFirstPage()
        #expect(ended.listings.map(\.id) == ["shown"])
        #expect(!ended.hasMore && !ended.isStalled)

        let empty = CommunityFeedPager(moderation: nil) { _ in .init(items: [], cursor: nil) }
        await empty.loadFirstPage()
        #expect(empty.listings.isEmpty && !empty.hasMore && !empty.isStalled)

        // A refresh that finds something clears a stall.
        let moderation = CommunityModeration(defaults: CommunityHarness.isolatedDefaults())
        moderation.setBlocked(true, author: .init(id: "u9", name: "Troll"))
        let stalled = CommunityFeedPager(moderation: moderation) { cursor in
            .init(items: [self.listing("h\(cursor ?? "0")", author: "u9")], cursor: String((cursor.flatMap { Int($0) } ?? 0) + 1))
        }
        await stalled.loadFirstPage()
        #expect(stalled.isStalled)
        moderation.setBlocked(false, author: .init(id: "u9", name: "Troll"))
        await stalled.refresh()
        #expect(!stalled.isStalled && stalled.hasMore && !stalled.listings.isEmpty)
    }
}

// MARK: Reports

@MainActor struct CommunityReportHardeningTests {
    @Test func aReportNoteIsCutToTheApisLimit() async throws {
        #expect(Community.reportNoteLimit == 500)
        let stub = CommunityStub()
        let client = CommunityHarness(stub: stub).client
        _ = try await client.report(recipeID: "r1", title: "Soup", reason: .other, note: String(repeating: "a", count: 1000))
        #expect((stub.last("POST", "/api/v2/report")?.json["note"] as? String)?.count == 500)
        _ = try await client.report(recipeID: "r1", title: "Soup", reason: .other, note: "Short")
        #expect(stub.last("POST", "/api/v2/report")?.json["note"] as? String == "Short")
    }

    @Test func aReportedTipStaysHiddenAfterTheRecipeIsOpenedAgain() async throws {
        let tips: [[String: Any]] = (0..<3).map { index in
            ["id": "t\(index)", "author": ["id": "u\(index + 10)", "name": "Cook \(index)"], "rating": 5, "tip": "Tip \(index)", "createdAt": "2026-11-03T10:00:00Z"]
        }
        let page = StubResponse.json(Fixture.detail(extra: ["tips": tips]))
        let stub = CommunityStub { request in request.path == "/api/v2/recipes/r1" ? page : Fixture.route(request) }
        let harness = CommunityHarness(stub: stub)
        let social = CommunitySocial(client: harness.client)
        let model = CommunityRecipeModel(id: "r1", preview: nil, client: harness.client, social: social)
        await model.load()
        #expect(model.tips.map(\.id) == ["t0", "t1", "t2"])

        // As the report sheet does: the client sends it, then the page is told.
        #expect(try await harness.client.report(recipeID: "r1", title: "Tomato soup", tipID: "t1", reason: .spam) == .sent)
        #expect(model.tips.map(\.id) == ["t0", "t2"])
        model.markReported(try #require(model.tips.first))
        #expect(model.tips.map(\.id) == ["t2"])
        // Reporting a tip doesn't hide its recipe.
        #expect(harness.moderation.hiddenRecipes.isEmpty)

        // The page opened again, and the app launched again.
        let reopened = CommunityRecipeModel(id: "r1", preview: nil, client: harness.client, social: social)
        await reopened.load()
        #expect(reopened.tips.map(\.id) == ["t2"])
        let relaunched = CommunityModeration(defaults: harness.defaults)
        #expect(relaunched.reportedTips == ["t1", "t0"])
        #expect(relaunched.visible(try #require(reopened.detail?.tips)).map(\.id) == ["t2"])
    }

    @Test func reportedTipsAreRememberedUpToALimit() {
        let defaults = CommunityHarness.isolatedDefaults()
        let moderation = CommunityModeration(defaults: defaults)
        for index in 0..<(CommunityModeration.reportedTipsLimit + 20) { moderation.markReported(tipID: "t\(index)") }
        moderation.markReported(tipID: "t30")
        moderation.markReported(tipID: "")
        #expect(moderation.reportedTips.count == CommunityModeration.reportedTipsLimit)
        // The oldest give way; the newest stay.
        #expect(moderation.reportedTips.first == "t20")
        #expect(moderation.reportedTips.last == "t\(CommunityModeration.reportedTipsLimit + 19)")
        #expect(CommunityModeration(defaults: defaults).reportedTips == moderation.reportedTips)
        // A longer list from somewhere else is cut when read.
        defaults.set((0..<2000).map { "x\($0)" }, forKey: "community.reportedTips")
        #expect(CommunityModeration(defaults: defaults).reportedTips.count == CommunityModeration.reportedTipsLimit)
    }
}
