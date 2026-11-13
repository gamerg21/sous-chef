import Foundation
import Testing
@testable import SousChef

/// The logic behind the Community screens: optimistic likes and follows,
/// the feed's filters, update checks, share links and wording.

private func listing(_ id: String = "r1", author: String = "u2", liked: Bool? = false, likes: Int = 5, extra: [String: Any] = [:]) throws -> Community.Listing {
    var fields: [String: Any] = ["likeCount": likes]
    if let liked { fields["liked"] = liked } else { fields["liked"] = NSNull() }
    fields.merge(extra) { _, new in new }
    return try JSONDecoder().decode(Community.Listing.self, from: JSONSerialization.data(withJSONObject: Fixture.listing(id, author: author, extra: fields)))
}

@MainActor struct CommunitySocialTests {
    @Test func aLikeShowsAtOnceAndTakesTheCommunitysCount() async throws {
        let release = DispatchSemaphore(value: 0)
        let stub = CommunityStub { request in
            if request.path == "/api/v2/like" {
                release.wait()
                return .json(["liked": true, "likeCount": 9])
            }
            return Fixture.route(request)
        }
        let harness = CommunityHarness(stub: stub, signedIn: true)
        let social = CommunitySocial(client: harness.client)
        let recipe = try listing()
        #expect(social.like(for: recipe) == .init(liked: false, count: 5))

        let sending = Task { try await social.toggleLike(recipe) }
        await eventually { stub.count("/api/v2/like") == 1 }
        // Before the community answers.
        #expect(social.like(for: recipe) == .init(liked: true, count: 6))
        // A second tap while the first is on its way does nothing.
        try await social.toggleLike(recipe)
        #expect(stub.count("/api/v2/like") == 1)

        release.signal()
        try await sending.value
        #expect(social.like(for: recipe) == .init(liked: true, count: 9))
        #expect(stub.last("POST", "/api/v2/like")?.json["liked"] as? Bool == true)
    }

    @Test func aRefusedLikeIsPutBack() async throws {
        let stub = CommunityStub { request in
            request.path == "/api/v2/like" ? .error(429, "Slow down") : Fixture.route(request)
        }
        let harness = CommunityHarness(stub: stub, signedIn: true)
        let social = CommunitySocial(client: harness.client)
        let recipe = try listing(liked: true, likes: 3)
        await #expect(throws: CommunityError.rateLimited) { try await social.toggleLike(recipe) }
        #expect(social.like(for: recipe) == .init(liked: true, count: 3))
    }

    @Test func unlikingNeverGoesBelowZero() async throws {
        let stub = CommunityStub { request in
            request.path == "/api/v2/like" ? .error(500, "Down") : Fixture.route(request)
        }
        let social = CommunitySocial(client: CommunityHarness(stub: stub, signedIn: true).client)
        let recipe = try listing(liked: true, likes: 0)
        _ = try? await social.toggleLike(recipe)
        #expect(social.like(for: recipe).count == 0)
    }

    @Test func freshListingsReplaceRememberedLikes() async throws {
        let harness = CommunityHarness(stub: CommunityStub(), signedIn: true)
        let social = CommunitySocial(client: harness.client)
        let recipe = try listing()
        try await social.toggleLike(recipe)
        #expect(social.like(for: recipe).count == 6)
        // Another device unliked it since; the feed's fresh copy wins.
        let fresh = try listing(liked: false, likes: 2)
        social.reconcile([fresh])
        #expect(social.like(for: fresh) == .init(liked: false, count: 2))
        // A listing without the viewer's state (signed out) doesn't erase what's known.
        try await social.toggleLike(fresh)
        social.reconcile([try listing(liked: nil, likes: 2)])
        #expect(social.like(for: fresh).liked)
    }

    @Test func followsShowAtOnceAndRollBack() async throws {
        let fail = Shared(false)
        let stub = CommunityStub { request in
            if request.path == "/api/v2/follow", fail.value { return .error(400, "You can follow at most 200 cooks") }
            return Fixture.route(request)
        }
        let social = CommunitySocial(client: CommunityHarness(stub: stub, signedIn: true).client)
        let before = social.follow(for: "u2", following: false, followers: 1)
        #expect(before == .init(following: false, followers: 1))

        try await social.toggleFollow(cookID: "u2", current: before)
        #expect(social.follow(for: "u2", following: false) == .init(following: true, followers: 9))
        #expect(stub.last("POST", "/api/v2/follow")?.json["following"] as? Bool == true)

        fail.value = true
        let following = social.follow(for: "u2", following: false)
        await #expect(throws: CommunityError.invalid("You can follow at most 200 cooks")) {
            try await social.toggleFollow(cookID: "u2", current: following)
        }
        #expect(social.follow(for: "u2", following: false) == following)
    }

    @Test func aCooksProfileSettlesTheFollowState() async throws {
        let social = CommunitySocial(client: CommunityHarness(stub: CommunityStub(), signedIn: true).client)
        let cook = try JSONDecoder().decode(Community.Cook.self, from: JSONSerialization.data(withJSONObject: [
            "id": "u2", "name": "Bea", "recipeCount": 1, "followerCount": 4, "followingCount": 0, "viewer": ["following": true, "own": false],
        ]))
        social.reconcile(cook)
        #expect(social.follow(for: "u2", following: false) == .init(following: true, followers: 4))
    }

    @Test func socialActionsAskForAnAccountWhenSignedOut() {
        let social = CommunitySocial(client: CommunityHarness(stub: CommunityStub()).client)
        #expect(social.accountPrompt == .signIn)
        #expect(social.myID == nil)
        #expect(!social.requireAccount())
        #expect(social.prompt == .signIn)

        let signedIn = CommunitySocial(client: CommunityHarness(stub: CommunityStub(), signedIn: true).client)
        #expect(signedIn.requireAccount())
        #expect(signedIn.prompt == nil)
        #expect(signedIn.myID == "u1")
    }

    @Test func aServerWithoutAConnectionExplainsWhereToConnect() async {
        let server = FakeKitchenServer { path, _ in
            path == "community:me" ? ["configured": true, "connected": false, "me": NSNull()] : ["tags": [Any]()]
        }
        let social = CommunitySocial(client: CommunityHarness(server: server).client)
        // Unknown until asked: the action goes ahead and the server's answer decides.
        #expect(social.accountPrompt == nil)
        await social.refreshStatus()
        #expect(social.accountPrompt == .connectOnServer)
        #expect(!social.requireAccount())
        #expect(social.prompt == .connectOnServer)
    }

    @Test func errorsBecomeAPromptOrANotice() {
        let social = CommunitySocial(client: CommunityHarness(stub: CommunityStub()).client)
        social.report(CommunityError.notSignedIn)
        #expect(social.prompt == .signIn && social.notice == nil)
        social.prompt = nil
        social.report(CommunityError.rateLimited)
        #expect(social.prompt == nil)
        #expect(social.notice == CommunityError.rateLimited.localizedDescription)
        social.notice = nil
        social.report(CancellationError())
        #expect(social.notice == nil)
        social.report(CommunityError.needsServerConnection)
        #expect(social.prompt == .connectOnServer)
    }

    @Test func savedRecipesShowAsSavedBeforeTheListReloads() throws {
        // Through a server, which says what's saved in each listing.
        let server = FakeKitchenServer { _, _ in [:] }
        let social = CommunitySocial(client: CommunityHarness(server: server).client)
        let recipe = try listing()
        #expect(!social.isSaved(recipe))
        social.markSaved("r1")
        #expect(social.isSaved(recipe))
        #expect(social.isSaved(try listing("r9", extra: ["saved": true])))
    }
}

@MainActor struct CommunityFeedModelTests {
    private func model(_ harness: CommunityHarness) -> CommunityFeedModel {
        CommunityFeedModel(client: harness.client, social: CommunitySocial(client: harness.client))
    }

    @Test func eachFeedAsksForItsOwnSource() {
        let model = model(CommunityHarness(stub: CommunityStub(), signedIn: true))
        #expect(model.source == .feed(Community.FeedQuery(sort: .new)))
        model.select(.trending)
        #expect(model.source == .feed(Community.FeedQuery(sort: .hot)))
        model.select(.top)
        #expect(model.source == .feed(Community.FeedQuery(sort: .top)))
        model.select(tag: "dinner")
        #expect(model.source == .feed(Community.FeedQuery(sort: .top, tag: "dinner")))
        model.select(.pantry)
        #expect(model.source == .pantry(Community.FeedQuery(tag: "dinner")))
        model.select(.following)
        #expect(model.source == .following)
    }

    @Test func choosingTheSelectedTagClearsIt() {
        let model = model(CommunityHarness(stub: CommunityStub()))
        model.select(tag: "dinner")
        #expect(model.tag == "dinner")
        let pager = model.pager
        model.select(tag: "dinner")
        #expect(model.tag == nil)
        #expect(model.pager !== pager)
    }

    @Test func searchWinsOverFeedAndTag() {
        let model = model(CommunityHarness(stub: CommunityStub()))
        model.select(.top)
        model.select(tag: "dinner")
        model.submitSearch("  soup ")
        #expect(model.isSearching)
        #expect(model.source == .feed(Community.FeedQuery(search: "soup")))
        #expect(!model.showsTags)
        // The same search again keeps the loaded pager.
        let pager = model.pager
        model.submitSearch("soup")
        #expect(model.pager === pager)
        model.submitSearch("")
        #expect(model.source == .feed(Community.FeedQuery(sort: .top, tag: "dinner")))
    }

    @Test func loadsTheFeedAndItsTags() async {
        let stub = CommunityStub()
        let model = model(CommunityHarness(stub: stub))
        await model.load()
        #expect(model.pager.listings.map(\.id) == ["r1"])
        #expect(model.tags.map(\.tag) == ["dinner"])
        #expect(model.showsTags)
        #expect(model.feeds == CommunityFeedModel.Feed.allCases)
        await model.load()
        #expect(stub.count("/api/v2/tags") == 1)
        model.select(.following)
        #expect(!model.showsTags)
    }

    @Test func anOlderCommunityOnlyListsAndSearches() async {
        let model = model(CommunityHarness(stub: CommunityStub(Fixture.legacyRoute)))
        await model.load()
        #expect(model.pager.listings.map(\.id) == ["old1"])
        #expect(model.feeds.isEmpty)
        #expect(model.tags.isEmpty && !model.showsTags)
    }

    @Test func aFeedAnOlderCommunityLacksFallsBackToTheList() async {
        // Following was selected on a newer community; the address then changed to an older one.
        let model = model(CommunityHarness(stub: CommunityStub(Fixture.legacyRoute), signedIn: true))
        model.select(.following)
        model.select(tag: "dinner")
        await model.load()
        #expect(model.feed == .new && model.tag == nil)
        #expect(model.pager.listings.map(\.id) == ["old1"])
        #expect(model.pager.error == nil)
    }

    @Test func followingWaitsForAnAccount() async {
        let stub = CommunityStub()
        let model = model(CommunityHarness(stub: stub))
        model.select(.following)
        #expect(model.needsAccount == .signIn)
        await model.load()
        #expect(stub.count("/api/v2/feed/following") == 0)
        #expect(!model.pager.hasLoaded)
        // Searching from there needs no account.
        model.submitSearch("soup")
        #expect(model.needsAccount == nil)
    }

    @Test func followingLoadsWhenSignedIn() async {
        let stub = CommunityStub()
        let model = model(CommunityHarness(stub: stub, signedIn: true))
        model.select(.following)
        #expect(model.needsAccount == nil)
        await model.load()
        #expect(stub.count("/api/v2/feed/following") == 1)
        #expect(model.pager.listings.count == 1)
    }

    @Test func signingInStartsTheFeedOver() async {
        let stub = CommunityStub()
        let harness = CommunityHarness(stub: stub)
        let social = CommunitySocial(client: harness.client)
        let model = CommunityFeedModel(client: harness.client, social: social)
        await model.load()
        let key = model.loadKey
        let pager = model.pager
        harness.account.save(CommunitySession(token: "tok", userID: "u1", name: "Ada", appleUserID: "apple-1", origin: stub.base.absoluteString))
        #expect(model.loadKey != key)
        await model.load()
        #expect(model.pager !== pager)
        #expect(model.pager.hasLoaded)
        #expect(stub.requests.last { $0.path == "/api/v2/recipes" }?.authorization == "Bearer tok")
    }
}

@MainActor struct CommunityUpdateCheckTests {
    @Test func checksAreSpacedOut() {
        var throttle = CommunityUpdateThrottle(interval: 600)
        let start = Date(timeIntervalSince1970: 1_000_000)
        let first = throttle.begin(now: start)
        let tooSoon = throttle.begin(now: start.addingTimeInterval(599))
        let due = throttle.begin(now: start.addingTimeInterval(600))
        #expect(first && !tooSoon && due)
        // A clock set back doesn't stop checks for good.
        let clockSetBack = throttle.begin(now: start.addingTimeInterval(-50))
        #expect(clockSetBack)
        let rightAfter = throttle.begin(now: start.addingTimeInterval(-49))
        throttle.failed()
        let afterFailure = throttle.begin(now: start.addingTimeInterval(-48))
        #expect(!rightAfter && afterFailure)
    }

    private let update: [String: Any] = ["recipeId": "srv1", "title": "Soup", "remoteId": "r1", "savedRevision": 1, "latestRevision": 2]

    @Test func theCheckerAsksOncePerInterval() async {
        let update = update
        let server = FakeKitchenServer { path, _ in path == "community:updates" ? ["updates": [update]] : [:] }
        let harness = CommunityHarness(server: server)
        harness.moderation.acceptGuidelines()
        let checker = CommunityUpdateChecker(client: harness.client, interval: 600)
        let start = Date(timeIntervalSince1970: 2_000_000)
        await checker.checkIfDue(now: start)
        #expect(harness.client.pendingUpdates.map(\.recipeId) == ["srv1"])
        await checker.checkIfDue(now: start.addingTimeInterval(60))
        #expect(server.count("community:updates") == 1)
        await checker.checkIfDue(now: start.addingTimeInterval(601))
        #expect(server.count("community:updates") == 2)
    }

    @Test func nothingIsCheckedBeforeTheGuidelinesAreAccepted() async {
        let server = FakeKitchenServer { _, _ in ["updates": [Any]()] }
        let harness = CommunityHarness(server: server)
        let checker = CommunityUpdateChecker(client: harness.client)
        await checker.checkIfDue()
        #expect(server.calls.isEmpty)
        harness.moderation.acceptGuidelines()
        await checker.checkIfDue()
        #expect(server.count("community:updates") == 1)
    }

    @Test func aFailedCheckIsTriedAgainNextTime() async {
        let failing = Shared(true)
        let server = FakeKitchenServer { _, _ in
            if failing.value { throw ServerClient.ServerError.unreachable }
            return ["updates": [Any]()]
        }
        let harness = CommunityHarness(server: server)
        harness.moderation.acceptGuidelines()
        let checker = CommunityUpdateChecker(client: harness.client, interval: 600)
        let start = Date(timeIntervalSince1970: 3_000_000)
        await checker.checkIfDue(now: start)
        failing.value = false
        await checker.checkIfDue(now: start.addingTimeInterval(5))
        #expect(server.count("community:updates") == 2)
    }
}

@MainActor struct CommunityLinkRoutingTests {
    @Test func aShareLinkOpensTheRecipeOnTheCommunityTab() throws {
        let navigator = AppNavigator()
        navigator.tab = .pantry
        #expect(navigator.open(communityLink: try #require(URL(string: "https://souschefkitchen.app/r/abc123"))))
        #expect(navigator.tab == .community)
        #expect(navigator.communityRecipeToOpen == "abc123")
    }

    @Test func otherLinksAreLeftAlone() throws {
        let navigator = AppNavigator()
        navigator.tab = .pantry
        for link in ["https://souschefkitchen.app/join#token", "https://souschefkitchen.app/", "https://example.com/r/abc", "souschef://community",
                     "http://souschefkitchen.app/r/abc", "https://souschefkitchen.app/r/"] {
            #expect(!navigator.open(communityLink: try #require(URL(string: link))), "\(link)")
        }
        #expect(navigator.tab == .pantry)
        #expect(navigator.communityRecipeToOpen == nil)
    }

    @Test func theSameLinkDeliveredTwiceOpensOnce() throws {
        let navigator = AppNavigator()
        let link = try #require(URL(string: "https://souschefkitchen.app/r/abc123"))
        let now = Date(timeIntervalSince1970: 5_000_000)
        #expect(navigator.open(communityLink: link, now: now))
        // The Community tab took it.
        navigator.communityRecipeToOpen = nil
        // iOS hands the scene and SwiftUI the same link.
        #expect(navigator.open(communityLink: link, now: now.addingTimeInterval(0.3)))
        #expect(navigator.communityRecipeToOpen == nil)
        // Tapping the link again later opens it again.
        #expect(navigator.open(communityLink: link, now: now.addingTimeInterval(30)))
        #expect(navigator.communityRecipeToOpen == "abc123")
        // A different recipe right away is a different link.
        #expect(navigator.open(communityLink: try #require(URL(string: "https://souschefkitchen.app/r/other")), now: now.addingTimeInterval(30.1)))
        #expect(navigator.communityRecipeToOpen == "other")
    }
}

@MainActor struct CommunityRecipeModelTests {
    private func tips(_ range: Range<Int>, text: Bool = true) -> [[String: Any]] {
        range.map { index in
            var tip: [String: Any] = ["id": "t\(index)", "author": ["id": "u\(index)", "name": "Cook \(index)"], "rating": 5, "createdAt": "2026-11-03T10:00:00Z"]
            if text { tip["tip"] = "Tip \(index)" }
            return tip
        }
    }

    private func model(_ harness: CommunityHarness, preview: Community.Listing? = nil) -> CommunityRecipeModel {
        CommunityRecipeModel(id: "r1", preview: preview, client: harness.client, social: CommunitySocial(client: harness.client))
    }

    @Test func loadsTheRecipeAndTheViewersState() async throws {
        let harness = CommunityHarness(stub: CommunityStub(), signedIn: true)
        let model = model(harness, preview: try listing(liked: nil))
        #expect(model.phase == .loading)
        #expect(model.listing?.title == "Tomato soup")
        await model.load()
        #expect(model.phase == .loaded)
        #expect(model.detail?.snapshot.steps.count == 1)
        #expect(model.listing?.liked == true)
        #expect(model.made?.rating == 4)
        #expect(!model.isOwn)
        #expect(model.follow == .init(following: false, followers: nil))
        #expect(!model.isSaved)
    }

    @Test func aRecipeThatIsGoneIsNotFound() async {
        let model = CommunityRecipeModel(id: "gone", preview: nil, client: CommunityHarness(stub: CommunityStub()).client,
                                         social: CommunitySocial(client: CommunityHarness(stub: CommunityStub()).client))
        await model.load()
        #expect(model.phase == .notFound)
    }

    @Test func anUnreachableCommunityFailsWithItsMessage() async {
        let reachable = Shared(true)
        let stub = CommunityStub { request in reachable.value ? Fixture.route(request) : .error(500, "Down") }
        let harness = CommunityHarness(stub: stub)
        let model = model(harness)
        reachable.value = false
        await model.load()
        #expect(model.phase == .failed(CommunityError.unavailable.localizedDescription))
        reachable.value = true
        await model.load()
        #expect(model.phase == .loaded)
        // Once loaded, a failed reload keeps the recipe on screen.
        reachable.value = false
        await model.load()
        #expect(model.phase == .loaded)
    }

    @Test func ownRecipesAreRecognized() async {
        let stub = CommunityStub { request in
            request.path == "/api/v2/recipes/r1" ? .json(Fixture.detail(extra: ["viewer": ["liked": false, "following": false, "own": true]])) : Fixture.route(request)
        }
        let model = model(CommunityHarness(stub: stub, signedIn: true))
        await model.load()
        #expect(model.isOwn)
        #expect(model.made == nil)
    }

    @Test func showsAFewTipsThenTheRestThenMoreFromTheCommunity() async {
        let first = tips(0..<20)
        let more = tips(18..<25) + tips(25..<27, text: false)
        let (page, rest) = (StubResponse.json(Fixture.detail(extra: ["tips": first])), StubResponse.json(["tips": more, "cursor": NSNull()]))
        let stub = CommunityStub { request in
            switch request.path {
            case "/api/v2/recipes/r1": page
            case "/api/v2/recipes/r1/tips": rest
            default: Fixture.route(request)
            }
        }
        let model = model(CommunityHarness(stub: stub))
        await model.load()
        #expect(model.tips.count == CommunityRecipeModel.collapsedTips)
        #expect(model.hasMoreTips)

        await model.showMoreTips()
        #expect(model.tips.count == 20)
        #expect(stub.count("/api/v2/recipes/r1/tips") == 0)
        // A full first set may not be all of them.
        #expect(model.hasMoreTips)

        await model.showMoreTips()
        // No duplicates, and ratings without a tip aren't listed.
        #expect(model.tips.map(\.id) == (0..<25).map { "t\($0)" })
        #expect(!model.hasMoreTips)
        #expect(stub.last("GET", "/api/v2/recipes/r1/tips")?.query["cursor"] == nil)
    }

    @Test func aFewTipsNeedNoShowMore() async {
        let model = model(CommunityHarness(stub: CommunityStub()))
        await model.load()
        #expect(model.tips.map(\.id) == ["t1"])
        #expect(!model.hasMoreTips)
    }

    @Test func reportedAndBlockedTipsDisappear() async throws {
        let first = tips(0..<3)
        let page = StubResponse.json(Fixture.detail(extra: ["tips": first]))
        let stub = CommunityStub { request in
            request.path == "/api/v2/recipes/r1" ? page : Fixture.route(request)
        }
        let harness = CommunityHarness(stub: stub)
        let model = model(harness)
        await model.load()
        model.markReported(try #require(model.tips.first))
        #expect(model.tips.map(\.id) == ["t1", "t2"])
        harness.moderation.setBlocked(true, author: Community.Author(id: "u2", name: "Cook 2"))
        #expect(model.tips.map(\.id) == ["t1"])
    }

    @Test func ratingUpdatesThePageAndReadsTheTipsAgain() async throws {
        let rated = Shared(false)
        let stub = CommunityStub { request in
            switch (request.method, request.path) {
            case ("GET", "/api/v2/recipes/r1"):
                var extra: [String: Any] = ["viewer": ["liked": false, "following": false, "own": false], "tips": [Any](), "madeCount": 0,
                                            "rating": rated.value ? 5 : NSNull()]
                if rated.value {
                    extra["tips"] = [["id": "mine", "author": ["id": "u1", "name": "Ada"], "rating": 5, "tip": "Add basil", "createdAt": "2026-11-03T10:00:00Z"]]
                    extra["madeCount"] = 1
                }
                return .json(Fixture.detail(extra: extra))
            case ("POST", "/api/v2/made"):
                rated.value = true
                return .json(["madeCount": 1, "rating": 5])
            case ("POST", "/api/v2/made/delete"):
                rated.value = false
                return .json(["madeCount": 0])
            default: return Fixture.route(request)
            }
        }
        let model = model(CommunityHarness(stub: stub, signedIn: true))
        await model.load()
        #expect(model.made == nil && model.tips.isEmpty)

        try await model.submitMade(rating: 5, tip: " Add basil ")
        #expect(model.made == .init(rating: 5, tip: "Add basil"))
        #expect(model.listing?.madeCount == 1 && model.listing?.rating == 5)
        #expect(model.tips.map(\.id) == ["mine"])
        #expect(stub.last("POST", "/api/v2/made")?.json["tip"] as? String == "Add basil")

        try await model.removeMade()
        #expect(model.made == nil)
        #expect(model.listing?.madeCount == 0 && model.listing?.rating == nil)
        #expect(model.tips.isEmpty)
    }

    @Test func aTipTheCommunityRefusesLeavesThePageAsItWas() async {
        let stub = CommunityStub { request in
            request.path == "/api/v2/made" ? .error(400, CommunityError.filterMessage) : Fixture.route(request)
        }
        let model = model(CommunityHarness(stub: stub, signedIn: true))
        await model.load()
        await #expect(throws: CommunityError.filtered(CommunityError.filterMessage)) { try await model.submitMade(rating: 1, tip: "nope") }
        #expect(model.made?.rating == 4)
    }

    @Test func savingMakesACopyAndMarksTheRecipeSaved() async throws {
        let harness = CommunityHarness(stub: CommunityStub())
        let social = CommunitySocial(client: harness.client)
        let model = CommunityRecipeModel(id: "r1", preview: nil, client: harness.client, social: social)
        await model.load()
        try await model.save()
        #expect(model.isSaved)
        #expect(model.savedRecipe?.title == "Tomato soup")
        #expect(model.listing?.saveCount == 3)
        #expect(social.isSaved(try listing()))
        // Opening the page again finds the copy.
        let again = CommunityRecipeModel(id: "r1", preview: nil, client: harness.client, social: social)
        await again.load()
        #expect(again.savedRecipe?.uuid == model.savedRecipe?.uuid)
    }
}

@MainActor struct CommunityWordingTests {
    @Test func countsAndRatings() {
        #expect(CommunityText.count(1, "like") == "1 like")
        #expect(CommunityText.count(0, "like") == "0 likes")
        #expect(CommunityText.count(2, "person", "people") == "2 people")
        #expect(CommunityText.rating(4) == "4")
        #expect(CommunityText.rating(4.5) == "4.5")
    }

    @Test func pantryMatches() {
        let ready = Community.PantryMatch(have: 3, total: 3, missing: [])
        #expect(CommunityText.pantry(ready) == "You have everything")
        #expect(CommunityText.missing(ready) == nil)
        let some = Community.PantryMatch(have: 5, total: 7, missing: ["Salt", "Basil"])
        #expect(CommunityText.pantry(some) == "You have 5 of 7")
        #expect(CommunityText.missing(some) == "Missing Salt, Basil")
        let many = Community.PantryMatch(have: 0, total: 5, missing: ["A", "B", "C", "D", "E"])
        #expect(CommunityText.missing(many) == "Missing A, B, C and 2 more")
    }

    @Test func aCardReadsAsOneSentence() throws {
        let recipe = try listing()
        let pantry = Community.PantryMatch(have: 1, total: 2, missing: ["Salt"])
        let full = CommunityText.summary(of: recipe, social: true, saved: true, pantry: pantry)
        #expect(full.hasPrefix("Tomato soup, by Bea, "))
        #expect(full.contains("rated 4.5 out of 5"))
        #expect(full.contains("saved to your recipes"))
        #expect(full.hasSuffix("You have 1 of 2, Missing Salt"))
        // Nothing social for an older community.
        #expect(!CommunityText.summary(of: recipe, social: false, saved: false, pantry: nil).contains("rated"))
    }

    @Test func aCooksRecipeStates() throws {
        func status(_ extra: [String: Any]) throws -> CommunityShareStatus { CommunityShareStatus(try listing(extra: extra)) }
        #expect(try status(["visibility": "public", "removed": false, "underReview": false]) == .isPublic)
        #expect(try status(["visibility": "unlisted"]) == .unlisted)
        #expect(try status(["visibility": "private"]) == .notShared)
        // Moderation outranks visibility, and removal outranks review.
        #expect(try status(["visibility": "public", "underReview": true]) == .underReview)
        #expect(try status(["visibility": "public", "removed": true, "underReview": true]) == .removed)
        #expect(CommunityShareStatus.removed.title == "Removed by a moderator")
        #expect(CommunityShareStatus.underReview.title == "Under review")
        #expect(CommunityShareStatus.notShared.title == "Not shared")
        #expect(CommunityShareStatus.isPublic.isVisible && CommunityShareStatus.unlisted.isVisible)
        #expect(!CommunityShareStatus.removed.isVisible && !CommunityShareStatus.notShared.isVisible)
    }

    @Test func blockedEntriesMapBackToCooks() {
        typealias Entry = CommunityClient.HiddenList.Entry
        #expect(CommunityModerationSettingsView.author(for: Entry(key: "id:u2", label: "Bea")) == Community.Author(id: "u2", name: "Bea"))
        #expect(CommunityModerationSettingsView.author(for: Entry(key: "name:bea", label: "Bea")) == Community.Author(id: "", name: "bea"))
        // A server lists the cook's ID itself.
        #expect(CommunityModerationSettingsView.author(for: Entry(key: "u2", label: "Bea")) == Community.Author(id: "u2", name: "Bea"))
        // Unblocking through those round-trips to the key this device stored.
        let moderation = CommunityModeration(defaults: CommunityHarness.isolatedDefaults())
        moderation.setBlocked(true, author: Community.Author(id: "", name: "Bea"))
        moderation.setBlocked(true, author: Community.Author(id: "u2", name: "Cy"))
        for entry in CommunityModerationSettingsView.local(moderation).authors {
            moderation.setBlocked(false, author: CommunityModerationSettingsView.author(for: entry))
        }
        #expect(moderation.blockedAuthors.isEmpty)
    }

    @Test func aTipReportByEmailSaysWhichTip() throws {
        let tip = try JSONDecoder().decode(Community.Tip.self, from: JSONSerialization.data(withJSONObject: [
            "id": "t1", "author": ["id": "u3", "name": "Cy"], "rating": 1, "tip": "Buy my stuff", "createdAt": "2026-11-03T10:00:00Z",
        ]))
        let target = CommunityReportTarget(listing: try listing(), tip: tip)
        #expect(target.id == "tip:t1")
        let mail = target.mail(reason: .spam, note: "Ad", origin: "https://c.example.test")
        #expect(mail.subject.contains("r1"))
        #expect(mail.body.contains("About the tip by Cy (t1): Buy my stuff"))
        #expect(mail.body.contains("Ad"))
        #expect(mail.body.contains("Author: Bea (u2)"))
        #expect(CommunityReportTarget(listing: try listing()).id == "recipe:r1")
    }
}
