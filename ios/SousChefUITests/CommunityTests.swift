import XCTest

/// Community 2.0 against a real community service.
///
/// These tests need the network and a development community, never the
/// production one. Give the test runner its address, and for the signed-in
/// tests a throwaway publisher token of a cook there:
///
///     TEST_RUNNER_COMMUNITY_TEST_URL=https://<deployment>.convex.site \
///     TEST_RUNNER_COMMUNITY_TEST_TOKEN=<token> \
///     xcodebuild test -scheme SousChef -only-testing:SousChefUITests/CommunityTests …
///
/// Without the address every networked test skips; without the token the
/// signed-in ones do. The token is handed to the app with the debug-only
/// `-communityTestToken` argument, since Sign in with Apple can't run in the
/// simulator. Each test undoes the likes, follows and ratings it makes, also
/// when it fails, and only one test reports a recipe, signed out, always the
/// same one.
@MainActor
final class CommunityTests: XCTestCase {
    private let app = XCUIApplication()
    /// Undo steps for what a test changed in the community; run in `tearDown`.
    private var cleanups: [(path: String, body: [String: Any])] = []

    private var communityURL: URL? {
        ProcessInfo.processInfo.environment["COMMUNITY_TEST_URL"].flatMap { $0.isEmpty ? nil : URL(string: $0) }
    }

    private var token: String? {
        ProcessInfo.processInfo.environment["COMMUNITY_TEST_TOKEN"].flatMap { $0.isEmpty ? nil : $0 }
    }

    override func setUp() async throws {
        continueAfterFailure = false
    }

    override func tearDown() async throws {
        undoChanges()
    }

    private func undoChanges() {
        for cleanup in cleanups {
            _ = try? post(cleanup.path, cleanup.body)
        }
        cleanups = []
    }

    // MARK: The community, asked directly

    private struct Listing {
        let id: String
        let title: String
        let authorID: String
        let authorName: String
        let ingredients: [String]
        let liked: Bool
        let likeCount: Int

        init?(_ json: [String: Any]) {
            guard let id = json["id"] as? String, let title = json["title"] as? String, let author = json["author"] as? [String: Any] else { return nil }
            self.id = id
            self.title = title
            authorID = author["id"] as? String ?? ""
            authorName = author["name"] as? String ?? ""
            ingredients = json["ingredientNames"] as? [String] ?? []
            liked = json["liked"] as? Bool ?? false
            likeCount = json["likeCount"] as? Int ?? 0
        }
    }

    private func request(_ path: String, method: String, body: [String: Any]?, signedIn: Bool) throws -> URLRequest {
        guard let base = communityURL else { throw XCTSkip("Set TEST_RUNNER_COMMUNITY_TEST_URL to a development community to run this test.") }
        var request = URLRequest(url: try XCTUnwrap(URL(string: base.absoluteString + path)), timeoutInterval: 20)
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        if signedIn, let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    /// Filled in by a request's completion handler, off the main thread.
    private final class Answer: @unchecked Sendable {
        var data: Data?
        var status = 0
    }

    /// Asks the community and waits for its answer. The tests themselves stay
    /// synchronous, so a failed assertion stops them at once.
    private func json(_ request: URLRequest) throws -> [String: Any] {
        let answer = Answer()
        let done = DispatchSemaphore(value: 0)
        URLSession.shared.dataTask(with: request) { data, response, _ in
            answer.data = data
            answer.status = (response as? HTTPURLResponse)?.statusCode ?? 0
            done.signal()
        }.resume()
        guard done.wait(timeout: .now() + 30) == .success, answer.status == 200, let data = answer.data,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw XCTSkip("The test community answered \(answer.status) for \(request.url?.path ?? "").")
        }
        return object
    }

    private func get(_ path: String, signedIn: Bool = false) throws -> [String: Any] {
        try json(request(path, method: "GET", body: nil, signedIn: signedIn))
    }

    @discardableResult
    private func post(_ path: String, _ body: [String: Any]) throws -> [String: Any] {
        try json(request(path, method: "POST", body: body, signedIn: true))
    }

    /// Every public recipe, newest first, as the New feed lists them.
    private func recipes(_ query: String = "", signedIn: Bool = false) throws -> [Listing] {
        var all: [Listing] = []
        var cursor: String?
        repeat {
            let page = try get("/api/v2/recipes?limit=50\(query)\(cursor.map { "&cursor=\($0)" } ?? "")", signedIn: signedIn)
            all += (page["recipes"] as? [[String: Any]] ?? []).compactMap(Listing.init)
            cursor = page["cursor"] as? String
        } while cursor != nil && all.count < 200
        return all
    }

    private func me() throws -> (id: String, following: Int) {
        let me = try post("/api/v2/me", [:])
        return (try XCTUnwrap(me["id"] as? String), me["followingCount"] as? Int ?? 0)
    }

    // MARK: Driving the app

    /// Launch arguments for the Community tab with the sample kitchen. Skips without a test community.
    private func arguments(signedIn: Bool = false, reset: Bool, community: String? = nil) throws -> [String] {
        var address = community
        if address == nil {
            guard let communityURL else { throw XCTSkip("Set TEST_RUNNER_COMMUNITY_TEST_URL to a development community to run this test.") }
            address = communityURL.absoluteString
        }
        var arguments = ["-uiTesting", "-seedSample", "-startTab", "community", "-community.url", address ?? ""]
        if reset { arguments.append("-resetCommunityState") }
        if signedIn {
            guard let token else { throw XCTSkip("Set TEST_RUNNER_COMMUNITY_TEST_TOKEN to a test cook's publisher token to run this test.") }
            arguments += ["-communityTestToken", token]
        }
        return arguments
    }

    private func launch(signedIn: Bool = false, reset: Bool = true, accept: Bool = true, community: String? = nil) throws {
        app.launchArguments = try arguments(signedIn: signedIn, reset: reset, community: community)
        app.launch()
        if accept { acceptGuidelines() }
    }

    private func acceptGuidelines() {
        let agree = app.buttons["agreeGuidelines"].firstMatch
        XCTAssertTrue(agree.waitForExistence(timeout: 20), "The guidelines come before any community content.")
        agree.tap()
    }

    private func card(_ title: String) -> XCUIElement {
        app.buttons.matching(identifier: "communityCard").matching(NSPredicate(format: "label BEGINSWITH %@", title + ",")).firstMatch
    }

    private var feed: XCUIElement { app.scrollViews["communityFeed"] }

    /// Scrolls the feed until the card shows, loading pages on the way.
    @discardableResult
    private func scrollTo(_ element: XCUIElement, swipes: Int = 16, in container: XCUIElement? = nil) -> Bool {
        let container = container ?? feed
        for _ in 0..<swipes where !(element.exists && element.isHittable) {
            container.swipeUp(velocity: .slow)
        }
        return element.exists
    }

    private func open(_ recipe: Listing) {
        let card = card(recipe.title)
        XCTAssertTrue(card.waitForExistence(timeout: 20), "\(recipe.title) should be in the feed")
        scrollTo(card)
        card.tap()
        XCTAssertTrue(app.staticTexts["communityRecipeTitle"].waitForExistence(timeout: 10))
    }

    /// Taps a feed chip, scrolling the row of feeds sideways to it first.
    private func showFeed(_ name: String) {
        let chip = app.buttons["communityFeed-\(name)"]
        XCTAssertTrue(chip.waitForExistence(timeout: 20))
        let row = app.scrollViews["Feed"]
        for _ in 0..<4 {
            let (frame, visible) = (chip.frame, row.frame)
            if frame.maxX > visible.maxX { row.swipeLeft(velocity: .slow) } else if frame.minX < visible.minX { row.swipeRight(velocity: .slow) } else { break }
        }
        chip.tap()
    }

    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func waitFor(_ predicate: NSPredicate, on element: XCUIElement, timeout: TimeInterval) {
        wait(for: [expectation(for: predicate, evaluatedWith: element)], timeout: timeout)
    }

    private func goBack() {
        app.navigationBars.buttons.element(boundBy: 0).tap()
    }

    // MARK: Browsing

    func testFeedLoadsAndPages() throws {
        let all = try recipes()
        let first = try XCTUnwrap(all.first, "The test community has no recipes.")
        try launch()
        XCTAssertTrue(card(first.title).waitForExistence(timeout: 20))
        attach("Feed")
        guard all.count > 20, let last = all.last else { return }
        // The oldest recipe is on a later page, loaded by scrolling.
        XCTAssertFalse(card(last.title).exists)
        XCTAssertTrue(scrollTo(card(last.title), swipes: 30), "Scrolling should load \(last.title) from the next page")
    }

    func testTagFilterNarrowsTheFeed() throws {
        let tags = (try get("/api/v2/tags")["tags"] as? [[String: Any]] ?? []).compactMap { $0["tag"] as? String }
        let all = try recipes()
        // The least used tag, so most of the feed falls away.
        let tag = try XCTUnwrap(tags.last, "The test community has no tags.")
        let tagged = try recipes("&tag=\(tag)")
        let match = try XCTUnwrap(tagged.first)
        let other = try XCTUnwrap(all.first { recipe in !tagged.contains { $0.id == recipe.id } }, "Every recipe has the tag \(tag).")

        try launch()
        XCTAssertTrue(card(other.title).waitForExistence(timeout: 20) || card(match.title).exists)
        let chip = app.buttons["communityTag-\(tag)"]
        XCTAssertTrue(chip.waitForExistence(timeout: 10))
        let tagRow = app.scrollViews["Tags"]
        for _ in 0..<6 where chip.frame.maxX > tagRow.frame.maxX { tagRow.swipeLeft(velocity: .slow) }
        chip.tap()
        XCTAssertTrue(card(match.title).waitForExistence(timeout: 15))
        XCTAssertFalse(card(other.title).exists)
        XCTAssertTrue(chip.isSelected)
        attach("Tag filter")

        // Tapping the tag again shows everything.
        chip.tap()
        XCTAssertTrue(card(try XCTUnwrap(all.first).title).waitForExistence(timeout: 15))
    }

    func testSearchFindsARecipe() throws {
        let all = try recipes()
        let wanted = try XCTUnwrap(all.last)
        let found = try recipes("&search=\(wanted.title.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")")
        XCTAssertTrue(found.contains { $0.id == wanted.id })
        let other = all.first { recipe in !found.contains { $0.title == recipe.title } }

        try launch()
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap()
        field.typeText(wanted.title + "\n")
        XCTAssertTrue(card(wanted.title).waitForExistence(timeout: 15))
        if let other { XCTAssertFalse(card(other.title).exists) }
        // The feed and tag filters don't apply to a search.
        XCTAssertFalse(app.buttons["communityFeed-top"].exists)
        attach("Search")
    }

    func testOpensARecipe() throws {
        let newest = try recipes()
        let recipe = try XCTUnwrap(newest.first)
        let detail = try get("/api/v2/recipes/\(recipe.id)")
        let steps = ((detail["snapshot"] as? [String: Any])?["steps"] as? [[String: Any]] ?? []).compactMap { $0["text"] as? String }

        try launch()
        open(recipe)
        XCTAssertEqual(app.staticTexts["communityRecipeTitle"].label, recipe.title)
        XCTAssertTrue(app.buttons["communityCook"].exists)
        XCTAssertTrue(app.buttons["communitySave"].waitForExistence(timeout: 15))
        if let step = steps.first {
            let text = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", step)).firstMatch
            XCTAssertTrue(scrollTo(text, in: app.scrollViews["communityRecipe"]), "The steps should load")
        }
        attach("Recipe")
    }

    func testPantryFeedPutsTheBestMatchFirst() throws {
        // What the sample kitchen has in stock (`SampleKitchen`).
        let pantry: Set<String> = ["penne", "tomatoes", "olive oil", "garlic", "parmesan", "eggs", "spinach", "whole milk", "chicken", "potatoes",
                                   "rosemary", "flour", "butter", "mixed greens", "coconut milk", "green curry paste"]
        func match(_ recipe: Listing) -> (have: Int, total: Int) {
            let names = Set(recipe.ingredients.map { $0.trimmingCharacters(in: .whitespaces).lowercased() })
            return (names.intersection(pantry).count, names.count)
        }
        let all = Array(try recipes().prefix(100))
        let best = try XCTUnwrap(all.filter { match($0).total > 0 }.max { left, right in
            Double(match(left).have) / Double(match(left).total) < Double(match(right).have) / Double(match(right).total)
        })
        let (have, total) = match(best)
        guard have > 0, have < total else { throw XCTSkip("No recipe in the test community partly matches the sample pantry.") }

        try launch()
        showFeed("pantry")
        let first = app.buttons.matching(identifier: "communityCard").firstMatch
        let expected = NSPredicate(format: "label CONTAINS %@ AND label CONTAINS 'Missing'", "You have \(have) of \(total)")
        waitFor(expected, on: first, timeout: 20)
        attach("Pantry feed")
    }

    // MARK: Signed out

    func testFollowingAndLikesAskToSignIn() throws {
        let newest = try recipes()
        let recipe = try XCTUnwrap(newest.first)
        try launch()
        showFeed("following")
        XCTAssertTrue(app.buttons["communityFollowingSignIn"].waitForExistence(timeout: 10))
        attach("Following, signed out")
        app.buttons["communityFollowingSignIn"].tap()
        XCTAssertTrue(app.buttons["communitySignIn"].waitForExistence(timeout: 10))
        app.buttons["Not now"].tap()

        showFeed("new")
        open(recipe)
        app.buttons["communityLike"].firstMatch.tap()
        XCTAssertTrue(app.buttons["communitySignIn"].waitForExistence(timeout: 10), "Liking signed out leads to Sign in with Apple")
        app.buttons["Not now"].tap()
        // Nothing was liked.
        XCTAssertFalse(app.buttons["communityLike"].firstMatch.isSelected)
    }

    func testReportingARecipeHidesIt() throws {
        // Always the same recipe, so repeated runs never add up to more than
        // this install's one report on it.
        let newest = try recipes()
        let target = try XCTUnwrap(newest.prefix(20).min { $0.id < $1.id })
        try launch()
        open(target)
        app.buttons["communityRecipeMenu"].tap()
        app.buttons["Report recipe"].tap()
        let reason = app.buttons["Spam or scam"]
        XCTAssertTrue(reason.waitForExistence(timeout: 10))
        reason.tap()
        app.buttons["sendReport"].tap()
        // Sent in the app: no Mail sheet.
        let done = app.buttons["reportDone"]
        XCTAssertTrue(done.waitForExistence(timeout: 20), "The report should be sent to the community")
        attach("Report received")
        done.tap()

        // Back in the feed without it.
        XCTAssertTrue(feed.waitForExistence(timeout: 10))
        XCTAssertFalse(card(target.title).exists)

        // It's listed in Settings, and unhiding brings it back.
        app.buttons["settingsButton"].tap()
        app.buttons["communitySettings"].tap()
        app.staticTexts["Blocked cooks and hidden recipes"].tap()
        let unhide = app.buttons["Unhide \(target.title)"]
        XCTAssertTrue(unhide.waitForExistence(timeout: 10))
        unhide.tap()
        XCTAssertTrue(app.staticTexts["No hidden recipes."].waitForExistence(timeout: 10))
    }

    func testSavesARecipeToMyRecipes() throws {
        let newest = try recipes()
        let recipe = try XCTUnwrap(newest.first)
        try launch()
        open(recipe)
        let save = app.buttons["communitySave"]
        XCTAssertTrue(save.waitForExistence(timeout: 15))
        save.tap()
        let saved = app.buttons["communityOpenSaved"]
        XCTAssertTrue(saved.waitForExistence(timeout: 20))
        attach("Saved")
        saved.tap()

        // The copy opens in Recipes, and is in the library.
        XCTAssertTrue(app.buttons["startCooking"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[recipe.title].exists)
        goBack()
        XCTAssertTrue(app.staticTexts[recipe.title].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Penne all'arrabbiata"].exists)

        // Community shows it as saved.
        app.tabBars.buttons["Community"].tap()
        XCTAssertTrue(app.buttons["communityOpenSaved"].waitForExistence(timeout: 10))
    }

    func testOffersAnUpdateToASavedRecipe() throws {
        let newest = try recipes()
        let recipe = try XCTUnwrap(newest.first)
        // A recipe saved in this launch counts as one revision behind.
        app.launchArguments = try arguments(reset: true) + ["-communityStaleSaves"]
        app.launch()
        acceptGuidelines()
        open(recipe)
        let save = app.buttons["communitySave"]
        XCTAssertTrue(save.waitForExistence(timeout: 15))
        save.tap()
        XCTAssertTrue(app.buttons["communityOpenSaved"].waitForExistence(timeout: 20))
        goBack()

        // Community says so, and lists it.
        let banner = app.buttons["communityUpdatesBanner"]
        XCTAssertTrue(banner.waitForExistence(timeout: 15))
        attach("Updates banner")
        banner.tap()
        XCTAssertTrue(app.staticTexts[recipe.title].waitForExistence(timeout: 10))
        attach("Updates")

        // So does the saved recipe's own page, where "Not now" is honored…
        app.tabBars.buttons["Recipes"].tap()
        let saved = app.staticTexts[recipe.title]
        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        saved.tap()
        XCTAssertTrue(app.staticTexts["The community recipe was updated"].waitForExistence(timeout: 10))
        attach("Update notice")
        app.tabBars.buttons["Community"].tap()

        // …and Update asks before replacing the copy.
        app.buttons["communityUpdateApply"].firstMatch.tap()
        let confirm = app.buttons["communityUpdateConfirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        confirm.tap()
        XCTAssertTrue(app.staticTexts["Everything is up to date"].waitForExistence(timeout: 20))
        app.tabBars.buttons["Recipes"].tap()
        XCTAssertFalse(app.staticTexts["The community recipe was updated"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts[recipe.title].exists)
    }

    // MARK: Share links

    // `XCUIApplication.open(_:)` starts the app with the link, so these cover a
    // link opened while the app isn't running. Opening one while it runs goes
    // through the same `AppNavigator.open(communityLink:)`, covered by
    // `CommunityLinkRoutingTests`; it needs a signed build to try by hand.

    private func shareLink(_ id: String) throws -> URL {
        try XCTUnwrap(URL(string: "https://souschefkitchen.app/r/\(id)"))
    }

    func testOpensAShareLink() throws {
        let all = try recipes()
        let recipe = try XCTUnwrap(all.last)
        // Agree to the guidelines first, as someone who has used Community has.
        try launch()
        XCTAssertTrue(feed.waitForExistence(timeout: 20))
        app.terminate()

        app.launchArguments = try arguments(reset: false)
        app.open(try shareLink(recipe.id))
        let title = app.staticTexts["communityRecipeTitle"]
        XCTAssertTrue(title.waitForExistence(timeout: 30))
        XCTAssertEqual(title.label, recipe.title)
        XCTAssertTrue(app.buttons["communitySave"].waitForExistence(timeout: 15))
        attach("Share link")
        // Back leads to the feed, not out of the app.
        goBack()
        XCTAssertTrue(feed.waitForExistence(timeout: 10))
    }

    func testAShareLinkWaitsForTheGuidelines() throws {
        let newest = try recipes()
        let recipe = try XCTUnwrap(newest.first)
        app.launchArguments = try arguments(reset: true)
        app.open(try shareLink(recipe.id))
        // Nothing from the community shows before agreeing.
        let agree = app.buttons["agreeGuidelines"].firstMatch
        XCTAssertTrue(agree.waitForExistence(timeout: 30))
        XCTAssertFalse(app.staticTexts["communityRecipeTitle"].exists)
        attach("Share link, guidelines first")
        agree.tap()
        let title = app.staticTexts["communityRecipeTitle"]
        XCTAssertTrue(title.waitForExistence(timeout: 20))
        XCTAssertEqual(title.label, recipe.title)
    }

    func testAShareLinkToAMissingRecipeSaysSo() throws {
        try launch()
        XCTAssertTrue(feed.waitForExistence(timeout: 20))
        app.terminate()

        app.launchArguments = try arguments(reset: false)
        app.open(try shareLink("not-a-recipe-0000"))
        XCTAssertTrue(app.staticTexts["Recipe not found"].waitForExistence(timeout: 30))
        attach("Missing recipe")
    }

    // MARK: Signed in

    /// A recipe by someone other than the signed-in cook.
    private func someoneElsesRecipe() throws -> Listing {
        let mine = try me().id
        let all = try recipes(signedIn: true)
        return try XCTUnwrap(all.first { $0.authorID != mine && !$0.authorID.isEmpty }, "The test community needs a recipe by another cook.")
    }

    func testLikeTogglesAndPersistsAfterRelaunch() throws {
        guard token != nil, communityURL != nil else { throw XCTSkip("Needs TEST_RUNNER_COMMUNITY_TEST_URL and TEST_RUNNER_COMMUNITY_TEST_TOKEN.") }
        let recipe = try someoneElsesRecipe()
        try post("/api/v2/like", ["id": recipe.id, "liked": false])
        cleanups.append(("/api/v2/like", ["id": recipe.id, "liked": false]))
        let unliked = try recipes(signedIn: true)
        let before = try XCTUnwrap(unliked.first { $0.id == recipe.id }).likeCount

        try launch(signedIn: true)
        open(recipe)
        let like = app.buttons["communityLike"].firstMatch
        XCTAssertFalse(like.isSelected)
        like.tap()
        let liked = NSPredicate(format: "value BEGINSWITH 'Liked'")
        waitFor(liked, on: like, timeout: 10)
        XCTAssertTrue((like.value as? String ?? "").contains("\(before + 1) like"))
        // The community has it, not just the screen.
        for _ in 0..<20 {
            if try recipes(signedIn: true).first(where: { $0.id == recipe.id })?.liked == true { break }
            Thread.sleep(forTimeInterval: 0.25)
        }
        let stored = try recipes(signedIn: true).first { $0.id == recipe.id }
        XCTAssertEqual(stored?.liked, true)
        attach("Liked")

        app.terminate()
        try launch(signedIn: true, reset: false, accept: false)
        open(recipe)
        let again = app.buttons["communityLike"].firstMatch
        waitFor(liked, on: again, timeout: 15)

        again.tap()
        waitFor(NSPredicate(format: "NOT (value BEGINSWITH 'Liked')"), on: again, timeout: 10)
        XCTAssertTrue((again.value as? String ?? "").hasPrefix("\(before) like"))
    }

    func testRatesWithATipThenRemovesIt() throws {
        guard token != nil, communityURL != nil else { throw XCTSkip("Needs TEST_RUNNER_COMMUNITY_TEST_URL and TEST_RUNNER_COMMUNITY_TEST_TOKEN.") }
        let recipe = try someoneElsesRecipe()
        _ = try? post("/api/v2/made/delete", ["id": recipe.id])
        cleanups.append(("/api/v2/made/delete", ["id": recipe.id]))
        let tip = "Great with extra lime \(Int.random(in: 1000...9999))"

        try launch(signedIn: true)
        open(recipe)
        let page = app.scrollViews["communityRecipe"]
        let made = app.buttons["communityMadeIt"]
        XCTAssertTrue(scrollTo(made, in: page))
        made.tap()

        let post = app.buttons["madePost"]
        XCTAssertTrue(post.waitForExistence(timeout: 10))
        XCTAssertFalse(post.isEnabled, "A rating is needed before posting")
        // The fourth of five stars.
        app.descendants(matching: .any)["starRating"].coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.5)).tap()
        XCTAssertTrue(post.isEnabled)
        let field = app.textFields["madeTip"].exists ? app.textFields["madeTip"] : app.textViews["madeTip"]
        field.tap()
        field.typeText(tip)
        XCTAssertTrue(app.staticTexts["madeTipCount"].label.hasPrefix("\(tip.count) of 280"))
        attach("I made this")
        post.tap()

        // The page shows the rating and the tip.
        let edit = app.buttons["communityEditMade"]
        XCTAssertTrue(edit.waitForExistence(timeout: 20))
        XCTAssertTrue(scrollTo(app.staticTexts.matching(NSPredicate(format: "label == %@", tip)).element(boundBy: 0), in: page))
        XCTAssertGreaterThanOrEqual(app.staticTexts.matching(NSPredicate(format: "label == %@", tip)).count, 1)
        attach("Rated")
        let stored = try get("/api/v2/recipes/\(recipe.id)", signedIn: true)
        XCTAssertEqual(((stored["viewer"] as? [String: Any])?["made"] as? [String: Any])?["rating"] as? Int, 4)

        // Edit, then remove.
        for _ in 0..<6 where !edit.isHittable { page.swipeDown(velocity: .slow) }
        edit.tap()
        let remove = app.buttons["madeRemove"]
        XCTAssertTrue(remove.waitForExistence(timeout: 10))
        remove.tap()
        let confirm = app.buttons["madeConfirmRemove"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        confirm.tap()
        XCTAssertTrue(app.buttons["communityMadeIt"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label == %@", tip)).count, 0)
        let after = try get("/api/v2/recipes/\(recipe.id)", signedIn: true)
        XCTAssertNil((after["viewer"] as? [String: Any])?["made"])
    }

    func testFollowsACookThenSeesThemInFollowing() throws {
        guard token != nil, communityURL != nil else { throw XCTSkip("Needs TEST_RUNNER_COMMUNITY_TEST_URL and TEST_RUNNER_COMMUNITY_TEST_TOKEN.") }
        let recipe = try someoneElsesRecipe()
        try post("/api/v2/follow", ["userId": recipe.authorID, "following": false])
        cleanups.append(("/api/v2/follow", ["userId": recipe.authorID, "following": false]))
        let followsNoOne = try me().following == 0

        try launch(signedIn: true)
        if followsNoOne {
            showFeed("following")
            XCTAssertTrue(app.staticTexts["No recipes from cooks you follow"].waitForExistence(timeout: 15))
            attach("Following, empty")
            showFeed("new")
        }

        open(recipe)
        let follow = app.buttons["communityFollow"]
        XCTAssertTrue(follow.waitForExistence(timeout: 10))
        XCTAssertEqual(follow.label, "Follow \(recipe.authorName)")
        follow.tap()
        waitFor(NSPredicate(format: "label BEGINSWITH 'Following'"), on: follow, timeout: 10)
        goBack()

        showFeed("following")
        let theirs = app.buttons.matching(identifier: "communityCard").matching(NSPredicate(format: "label CONTAINS %@", "by \(recipe.authorName)")).firstMatch
        XCTAssertTrue(theirs.waitForExistence(timeout: 20), "Following should list \(recipe.authorName)'s recipes")
        attach("Following")

        // Their profile, where the follow can be undone.
        theirs.tap()
        app.buttons["communityCook"].tap()
        XCTAssertTrue(app.staticTexts["cookName"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["cookName"].label, recipe.authorName)
        attach("Cook profile")
        let unfollow = app.buttons["communityFollow"]
        waitFor(NSPredicate(format: "label BEGINSWITH 'Following'"), on: unfollow, timeout: 10)
        unfollow.tap()
        waitFor(NSPredicate(format: "label BEGINSWITH 'Follow '"), on: unfollow, timeout: 10)
    }

    // MARK: Without a community

    func testAnUnreachableCommunityOffersToTryAgain() throws {
        try launch(community: "https://community.invalid")
        XCTAssertTrue(app.buttons["communityRetry"].waitForExistence(timeout: 40))
        XCTAssertTrue(app.staticTexts["Can't reach the community"].exists)
        attach("Offline")
    }

    func testWhatsNewShowsTheCommunityRelease() {
        app.launchArguments = ["-uiTesting", "-seedSample", "-showWhatsNew", "-whatsNewVersion", "1.3.0", "-whatsNew.seenRelease", "1.2"]
        app.launch()
        XCTAssertTrue(app.staticTexts["in Sous Chef 1.3"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Cook from your pantry"].exists)
        attach("What's new")
        app.buttons["whatsNewContinue"].tap()
        XCTAssertFalse(app.staticTexts["in Sous Chef 1.3"].waitForExistence(timeout: 2))
    }
}
