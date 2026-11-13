import XCTest

/// Community 2.0 in companion mode: the app connected to a real Sous Chef
/// server, reaching the community through that server's `community:…`
/// operations.
///
/// These tests need a running Sous Chef 1.3.0 server that is linked to a
/// development community (never the production one), and an account on it
/// whose community account is connected and whose kitchen has a few pantry
/// items in stock:
///
///     TEST_RUNNER_COMPANION_TEST_URL=http://localhost:3000 \
///     TEST_RUNNER_COMPANION_TEST_EMAIL=<email> \
///     TEST_RUNNER_COMPANION_TEST_PASSWORD=<password> \
///     xcodebuild test -scheme SousChef -only-testing:SousChefUITests/CompanionCommunityTests …
///
/// Without all three every test skips. The app connects through Settings, as
/// a person would, and stays connected for the following tests; the kitchen
/// on the device is in memory and starts empty, so nothing is copied to the
/// server. Each test undoes the likes, follows, ratings, saved copies and
/// hidden recipes it makes, also when it fails, and only one test reports a
/// recipe, always the same one.
@MainActor
final class CompanionCommunityTests: XCTestCase {
    private let app = XCUIApplication()
    /// Undo steps for what a test changed on the server; run in `tearDown`.
    private var cleanups: [(operation: String, arguments: [String: Any])] = []
    private var sessionToken: String?

    private func environment(_ name: String) -> String? {
        ProcessInfo.processInfo.environment[name].flatMap { $0.isEmpty ? nil : $0 }
    }

    private var serverURL: URL? { environment("COMPANION_TEST_URL").flatMap(URL.init(string:)) }
    private var email: String? { environment("COMPANION_TEST_EMAIL") }
    private var password: String? { environment("COMPANION_TEST_PASSWORD") }

    private func configuration() throws -> (url: URL, email: String, password: String) {
        guard let serverURL, let email, let password else {
            throw XCTSkip("Set TEST_RUNNER_COMPANION_TEST_URL, TEST_RUNNER_COMPANION_TEST_EMAIL and TEST_RUNNER_COMPANION_TEST_PASSWORD to a test server to run this test.")
        }
        return (serverURL, email, password)
    }

    override func setUp() async throws {
        continueAfterFailure = false
    }

    override func tearDown() async throws {
        for cleanup in cleanups {
            _ = try? server(cleanup.operation, cleanup.arguments)
        }
        cleanups = []
    }

    // MARK: The server, asked directly

    private struct Listing {
        let id: String
        let title: String
        let authorID: String
        let authorName: String
        let liked: Bool
        let likeCount: Int
        let saved: Bool
        let pantry: (have: Int, total: Int)?

        init?(_ json: [String: Any]) {
            guard let id = json["id"] as? String, let title = json["title"] as? String, let author = json["author"] as? [String: Any] else { return nil }
            self.id = id
            self.title = title
            authorID = author["id"] as? String ?? ""
            authorName = author["name"] as? String ?? ""
            liked = json["liked"] as? Bool ?? false
            likeCount = json["likeCount"] as? Int ?? 0
            saved = json["saved"] as? Bool ?? false
            let match = json["pantry"] as? [String: Any]
            pantry = match.flatMap { match in
                guard let have = match["have"] as? Int, let total = match["total"] as? Int else { return nil }
                return (have, total)
            }
        }
    }

    /// Filled in by a request's completion handler, off the main thread.
    private final class Answer: @unchecked Sendable {
        var data: Data?
        var status = 0
        var cookie: String?
    }

    /// Sends a request to the server and waits for its answer. The tests
    /// themselves stay synchronous, so a failed assertion stops them at once.
    private func send(_ path: String, body: [String: Any], cookie: String?) throws -> Answer {
        let base = try configuration().url
        var request = URLRequest(url: try XCTUnwrap(URL(string: base.absoluteString + path)), timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        if let cookie { request.setValue("sous_chef_session=\(cookie)", forHTTPHeaderField: "Cookie") }
        let answer = Answer()
        let done = DispatchSemaphore(value: 0)
        URLSession(configuration: .ephemeral).dataTask(with: request) { data, response, _ in
            answer.data = data
            let response = response as? HTTPURLResponse
            answer.status = response?.statusCode ?? 0
            let header = response?.value(forHTTPHeaderField: "Set-Cookie") ?? ""
            if let range = header.range(of: "sous_chef_session=") {
                answer.cookie = String(header[range.upperBound...].prefix { $0 != ";" && $0 != "," })
            }
            done.signal()
        }.resume()
        guard done.wait(timeout: .now() + 40) == .success else { throw XCTSkip("The test server didn't answer \(path).") }
        return answer
    }

    /// Runs a kitchen operation as the test account, signing in first.
    @discardableResult
    private func server(_ operation: String, _ arguments: [String: Any] = [:]) throws -> Any {
        if sessionToken == nil {
            let configuration = try configuration()
            let answer = try send("/api/auth", body: ["flow": "signIn", "email": configuration.email, "password": configuration.password], cookie: nil)
            guard answer.status == 200, let cookie = answer.cookie else { throw XCTSkip("The test server refused the test account (\(answer.status)).") }
            sessionToken = cookie
        }
        let answer = try send("/api/kitchen", body: ["path": operation, "args": arguments], cookie: sessionToken)
        let json = try answer.data.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        guard answer.status == 200, let value = json?["value"] else {
            throw XCTSkip("The test server answered \(answer.status) for \(operation): \(json?["error"] as? String ?? "")")
        }
        return value
    }

    private func object(_ operation: String, _ arguments: [String: Any] = [:]) throws -> [String: Any] {
        // Asked first: a skip thrown inside `XCTUnwrap` would count as a failure.
        let value = try server(operation, arguments)
        return try XCTUnwrap(value as? [String: Any])
    }

    /// Every public recipe as the server lists it, newest first.
    private func recipes(_ arguments: [String: Any] = [:]) throws -> [Listing] {
        var all: [Listing] = []
        var cursor: String?
        repeat {
            var arguments = arguments
            arguments["limit"] = 50
            if let cursor { arguments["cursor"] = cursor }
            let page = try object("community:feed", arguments)
            all += (page["recipes"] as? [[String: Any]] ?? []).compactMap(Listing.init)
            cursor = page["cursor"] as? String
        } while cursor != nil && all.count < 200
        return all
    }

    private func me() throws -> (id: String, name: String, following: Int) {
        let status = try object("community:me")
        guard let me = status["me"] as? [String: Any], let id = me["id"] as? String else {
            throw XCTSkip("The test account's community account isn't connected on the test server.")
        }
        return (id, me["name"] as? String ?? "", me["followingCount"] as? Int ?? 0)
    }

    /// A recipe by someone other than the connected cook.
    private func someoneElsesRecipe(where wanted: (Listing) -> Bool = { _ in true }) throws -> Listing {
        let mine = try me().id
        let all = try recipes()
        return try XCTUnwrap(all.first { $0.authorID != mine && !$0.authorID.isEmpty && wanted($0) }, "The test community needs a recipe by another cook.")
    }

    private func isHidden(_ recipe: Listing) throws -> Bool {
        (try object("community:hidden")["recipes"] as? [[String: Any]] ?? []).contains { $0["key"] as? String == recipe.id }
    }

    private func savedRecipeIDs() throws -> Set<String> {
        Set((try object("recipes:list")["recipes"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String })
    }

    // MARK: Driving the app

    /// Starts the app and connects it to the test server in Settings, unless
    /// an earlier test already did. Then opens Community.
    private func launch(reset: Bool = true) throws {
        let configuration = try configuration()
        // Skips before the app starts when the server can't be used.
        _ = try me()
        // The address and email fill the connection form; the password is typed.
        app.launchArguments = ["-uiTesting", "-onboarding.done", "YES", "-server.url", configuration.url.absoluteString, "-server.email", configuration.email]
        if reset { app.launchArguments.append("-resetCommunityState") }
        app.launch()

        app.buttons["settingsButton"].firstMatch.tap()
        let sync = app.buttons["syncSettings"]
        XCTAssertTrue(sync.waitForExistence(timeout: 10))
        sync.tap()
        let connect = app.buttons["connectServer"]
        let disconnect = app.buttons["Disconnect"]
        if !disconnect.waitForExistence(timeout: 3) {
            XCTAssertTrue(connect.waitForExistence(timeout: 10), "Settings should offer to connect a server")
            connect.tap()
            let field = app.secureTextFields["Password"]
            XCTAssertTrue(field.waitForExistence(timeout: 10))
            field.tap()
            field.typeText(configuration.password)
            app.buttons["Connect"].tap()
            XCTAssertTrue(disconnect.waitForExistence(timeout: 40), "The app should connect to the test server")
            attach("Connected")
            // The system then offers to keep the password, over whatever is on
            // screen. Answer it and start again, connected as after any launch.
            dismissSavePassword()
            app.terminate()
            return try launch(reset: reset)
        }
        goBack()
        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 10))
        done.tap()

        app.tabBars.buttons["Community"].tap()
        if reset {
            let agree = app.buttons["agreeGuidelines"].firstMatch
            XCTAssertTrue(agree.waitForExistence(timeout: 20), "The guidelines come before any community content.")
            agree.tap()
        }
    }

    /// The system offers to keep the password just typed; it covers the app until answered.
    private func dismissSavePassword() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<20 {
            for notNow in [app.buttons["Not Now"], springboard.buttons["Not Now"]] where notNow.exists {
                notNow.tap()
                return
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
    }

    private func card(_ title: String) -> XCUIElement {
        app.buttons.matching(identifier: "communityCard").matching(NSPredicate(format: "label BEGINSWITH %@", title + ",")).firstMatch
    }

    private var feed: XCUIElement { app.scrollViews["communityFeed"] }

    /// Scrolls until the element shows, loading pages on the way.
    @discardableResult
    private func scrollTo(_ element: XCUIElement, swipes: Int = 16, in container: XCUIElement? = nil) -> Bool {
        let container = container ?? feed
        for _ in 0..<swipes where !(element.exists && element.isHittable) {
            container.swipeUp(velocity: .slow)
        }
        return element.exists
    }

    /// Scrolls the feed back to its first cards.
    private func scrollToTop() {
        let chip = app.buttons["communityFeed-new"]
        for _ in 0..<40 where !chip.exists || chip.frame.minY < feed.frame.minY + 40 {
            feed.swipeDown(velocity: .fast)
        }
    }

    private func open(_ recipe: Listing) {
        let card = card(recipe.title)
        XCTAssertTrue(card.waitForExistence(timeout: 20) || scrollTo(card), "\(recipe.title) should be in the feed")
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

    /// Nothing on screen says the community or the server failed.
    private func assertNoErrors(file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertFalse(app.buttons["communityRetry"].exists, "The feed shows an error", file: file, line: line)
        XCTAssertFalse(app.staticTexts["communityNotice"].exists, "Community shows a notice: \(app.staticTexts["communityNotice"].exists ? app.staticTexts["communityNotice"].label : "")", file: file, line: line)
        XCTAssertFalse(app.staticTexts["Recipe not found"].exists, file: file, line: line)
    }

    /// Asks the server until `condition` holds.
    private func eventually(_ what: String, timeout: TimeInterval = 30, _ condition: () throws -> Bool) throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if try condition() { return }
            Thread.sleep(forTimeInterval: 0.5)
        }
        XCTFail("The server should say: \(what)")
    }

    // MARK: Browsing

    func testFeedLoadsPagesFiltersAndSearches() throws {
        let all = try recipes()
        let first = try XCTUnwrap(all.first, "The test community has no recipes.")
        let tags = (try object("community:tags")["tags"] as? [[String: Any]] ?? []).compactMap { $0["tag"] as? String }

        try launch()
        XCTAssertTrue(card(first.title).waitForExistence(timeout: 20))
        // Every feed is offered: the server has the 1.3.0 operations.
        XCTAssertTrue(app.buttons["communityFeed-top"].exists)
        attach("Feed")
        if all.count > 20, let last = all.last {
            // The oldest recipe is on a later page, loaded by scrolling.
            XCTAssertFalse(card(last.title).exists)
            XCTAssertTrue(scrollTo(card(last.title), swipes: 30), "Scrolling should load \(last.title) from the next page")
            scrollToTop()
        }

        // The least used tag, so most of the feed falls away.
        if let tag = tags.last {
            let tagged = try recipes(["tag": tag])
            let match = try XCTUnwrap(tagged.first)
            let other = try XCTUnwrap(all.first { recipe in !tagged.contains { $0.id == recipe.id } }, "Every recipe has the tag \(tag).")
            let chip = app.buttons["communityTag-\(tag)"]
            XCTAssertTrue(chip.waitForExistence(timeout: 10))
            let tagRow = app.scrollViews["Tags"]
            for _ in 0..<6 where chip.frame.maxX > tagRow.frame.maxX { tagRow.swipeLeft(velocity: .slow) }
            chip.tap()
            XCTAssertTrue(card(match.title).waitForExistence(timeout: 15))
            XCTAssertFalse(card(other.title).exists)
            XCTAssertTrue(chip.isSelected)
            attach("Tag filter")
            chip.tap()
            XCTAssertTrue(card(first.title).waitForExistence(timeout: 15))
        }

        let wanted = try XCTUnwrap(all.last)
        let found = try recipes(["search": wanted.title])
        XCTAssertTrue(found.contains { $0.id == wanted.id })
        let other = all.first { recipe in !found.contains { $0.title == recipe.title } }
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 20))
        field.tap()
        field.typeText(wanted.title + "\n")
        XCTAssertTrue(card(wanted.title).waitForExistence(timeout: 15))
        if let other { XCTAssertFalse(card(other.title).exists) }
        attach("Search")
        assertNoErrors()
    }

    func testPantryFeedAndRecipeUseTheServersKitchen() throws {
        // What the server says about its own pantry.
        let matched = try recipes(["pantry": true])
        let best = try XCTUnwrap(matched.first { $0.pantry != nil }, "The server didn't match the pantry.")
        let match = try XCTUnwrap(best.pantry)
        guard match.have > 0 else { throw XCTSkip("The test kitchen has nothing in stock that a community recipe uses.") }
        let expected = match.have >= match.total ? "You have everything" : "You have \(match.have) of \(match.total)"

        try launch()
        showFeed("pantry")
        let first = app.buttons.matching(identifier: "communityCard").firstMatch
        waitFor(NSPredicate(format: "label CONTAINS %@", expected), on: first, timeout: 20)
        attach("Pantry feed")
        // A recipe the kitchen can't make says what's missing.
        if let partial = matched.first(where: { ($0.pantry?.total ?? 0) > 0 && ($0.pantry?.have ?? 0) < ($0.pantry?.total ?? 0) }), let lacking = partial.pantry {
            let card = card(partial.title)
            XCTAssertTrue(scrollTo(card, swipes: 30), "\(partial.title) should be in the pantry feed")
            XCTAssertTrue(card.label.contains("You have \(lacking.have) of \(lacking.total)"), card.label)
            XCTAssertTrue(card.label.contains("Missing"), card.label)
            attach("Pantry feed, missing")
            scrollToTop()
        }

        // The recipe's page has the server's match too, also when opened from a feed that doesn't carry one.
        showFeed("new")
        open(best)
        let pantry = app.descendants(matching: .any)["communityPantryMatch"]
        XCTAssertTrue(scrollTo(pantry, in: app.scrollViews["communityRecipe"]), "The recipe should show the pantry match")
        XCTAssertTrue(pantry.label.contains(match.have >= match.total ? "You have everything for this recipe." : "You have \(match.have) of \(match.total) ingredients."), pantry.label)
        attach("Recipe, pantry match")
        assertNoErrors()
    }

    // MARK: Social, through the server's community account

    func testLikeTogglesAndPersistsAfterRelaunch() throws {
        let recipe = try someoneElsesRecipe { !$0.liked }
        cleanups.append(("community:like", ["id": recipe.id, "liked": false]))
        let before = recipe.likeCount

        try launch()
        open(recipe)
        let like = app.buttons["communityLike"].firstMatch
        XCTAssertFalse(like.isSelected)
        like.tap()
        let liked = NSPredicate(format: "value BEGINSWITH 'Liked'")
        waitFor(liked, on: like, timeout: 10)
        XCTAssertTrue((like.value as? String ?? "").contains("\(before + 1) like"))
        // The community has it, not just the screen.
        try eventually("\(recipe.title) is liked") { try recipes().first { $0.id == recipe.id }?.liked == true }
        attach("Liked")
        assertNoErrors()

        app.terminate()
        try launch(reset: false)
        open(recipe)
        let again = app.buttons["communityLike"].firstMatch
        waitFor(liked, on: again, timeout: 15)

        again.tap()
        waitFor(NSPredicate(format: "NOT (value BEGINSWITH 'Liked')"), on: again, timeout: 10)
        XCTAssertTrue((again.value as? String ?? "").hasPrefix("\(before) like"))
        try eventually("\(recipe.title) is no longer liked") { try recipes().first { $0.id == recipe.id }?.liked == false }
        assertNoErrors()
    }

    func testRatesWithATipThenRemovesIt() throws {
        let recipe = try someoneElsesRecipe { candidate in
            // One the connected cook hasn't rated, so nothing of theirs is replaced.
            ((try? self.object("community:recipe", ["id": candidate.id]))?["viewer"] as? [String: Any])?["made"] == nil
        }
        cleanups.append(("community:removeMade", ["id": recipe.id]))
        let tip = "Great with extra lime \(Int.random(in: 1000...9999))"

        try launch()
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
        post.tap()

        // The page shows the rating and the tip, and the community has them.
        let edit = app.buttons["communityEditMade"]
        XCTAssertTrue(edit.waitForExistence(timeout: 20))
        XCTAssertTrue(scrollTo(app.staticTexts.matching(NSPredicate(format: "label == %@", tip)).element(boundBy: 0), in: page))
        attach("Rated")
        let stored = try object("community:recipe", ["id": recipe.id])
        XCTAssertEqual(((stored["viewer"] as? [String: Any])?["made"] as? [String: Any])?["rating"] as? Int, 4)
        assertNoErrors()

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
        let after = try object("community:recipe", ["id": recipe.id])
        XCTAssertNil((after["viewer"] as? [String: Any])?["made"])
        assertNoErrors()
    }

    func testFollowsACookThenSeesThemInFollowing() throws {
        let recipe = try someoneElsesRecipe()
        // Start from not following, and leave the cook as they were found.
        let wasFollowing = (try object("community:cook", ["id": recipe.authorID])["viewer"] as? [String: Any])?["following"] as? Bool ?? false
        try server("community:follow", ["userId": recipe.authorID, "following": false])
        cleanups.append(("community:follow", ["userId": recipe.authorID, "following": wasFollowing]))
        let followsNoOne = try me().following == 0

        try launch()
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
        try eventually("the cook is followed") {
            (try object("community:cook", ["id": recipe.authorID])["viewer"] as? [String: Any])?["following"] as? Bool == true
        }
        goBack()

        showFeed("following")
        let theirs = app.buttons.matching(identifier: "communityCard").matching(NSPredicate(format: "label CONTAINS %@", "by \(recipe.authorName)")).firstMatch
        XCTAssertTrue(theirs.waitForExistence(timeout: 20), "Following should list \(recipe.authorName)'s recipes")
        attach("Following")
        assertNoErrors()

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
        try eventually("the cook is no longer followed") {
            (try object("community:cook", ["id": recipe.authorID])["viewer"] as? [String: Any])?["following"] as? Bool == false
        }
        assertNoErrors()
    }

    // MARK: Saving

    func testSavesACopyOnTheServerAndAgainAfterDeletingIt() throws {
        let recipe = try someoneElsesRecipe { !$0.saved }
        let before = try savedRecipeIDs()
        defer {
            // Copies this test left on the server.
            for id in ((try? savedRecipeIDs()) ?? []).subtracting(before) { _ = try? server("recipes:remove", ["id": id]) }
        }

        try launch()
        // A recipe the kitchen already has a copy of says so, from the server.
        if let saved = try recipes().first(where: \.saved) {
            let card = card(saved.title)
            XCTAssertTrue(scrollTo(card, swipes: 30))
            XCTAssertTrue(card.label.contains("saved to your recipes"), card.label)
            card.tap()
            let opens = app.buttons["communityOpenSaved"]
            XCTAssertTrue(opens.waitForExistence(timeout: 15), "\(saved.title) should show as saved")
            waitFor(NSPredicate(format: "isEnabled == true"), on: opens, timeout: 20)
            attach("Already saved")
            goBack()
            scrollToTop()
        }

        open(recipe)
        let save = app.buttons["communitySave"]
        XCTAssertTrue(save.waitForExistence(timeout: 15))
        save.tap()
        let saved = app.buttons["communityOpenSaved"]
        XCTAssertTrue(saved.waitForExistence(timeout: 30))
        waitFor(NSPredicate(format: "isEnabled == true"), on: saved, timeout: 20)
        attach("Saved")
        // The copy is the server's.
        let detail = try object("community:recipe", ["id": recipe.id])
        XCTAssertEqual(detail["saved"] as? Bool, true)
        let copyID = try XCTUnwrap(detail["savedRecipeId"] as? String)
        XCTAssertTrue(try savedRecipeIDs().contains(copyID))
        XCTAssertFalse(before.contains(copyID))
        assertNoErrors()

        // It opens in Recipes, synced from the server.
        saved.tap()
        XCTAssertTrue(app.buttons["startCooking"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts[recipe.title].exists)
        attach("The copy")

        // Deleting the copy reaches the server, and the recipe can be saved again.
        app.navigationBars.buttons["More"].firstMatch.tap()
        app.buttons["Delete"].tap()
        let confirm = app.buttons["recipeConfirmDelete"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        confirm.tap()
        try eventually("the copy of \(recipe.title) is gone") { try !savedRecipeIDs().contains(copyID) }
        app.tabBars.buttons["Community"].tap()
        XCTAssertTrue(save.waitForExistence(timeout: 20), "A deleted copy lets the recipe be saved again")
        attach("Can be saved again")
        save.tap()
        XCTAssertTrue(saved.waitForExistence(timeout: 30))
        let again = try object("community:recipe", ["id": recipe.id])
        XCTAssertEqual(again["saved"] as? Bool, true)
        XCTAssertNotEqual(again["savedRecipeId"] as? String, copyID)
        assertNoErrors()
    }

    // MARK: Reporting and hiding

    func testReportingARecipeHidesItUntilUnhidden() throws {
        // Always the same recipe, the oldest by another cook, and always as
        // the same account: repeated runs never add up to more than one reporter.
        let mine = try me().id
        let all = try recipes()
        let target = try XCTUnwrap(all.last { $0.authorID != mine && !$0.authorID.isEmpty }, "The test community needs a recipe by another cook.")
        cleanups.append(("community:hide", ["kind": "recipe", "key": target.id, "label": target.title, "hidden": false]))

        try launch()
        XCTAssertTrue(card(try XCTUnwrap(all.first).title).waitForExistence(timeout: 20))
        XCTAssertTrue(scrollTo(card(target.title), swipes: 30))
        card(target.title).tap()
        XCTAssertTrue(app.staticTexts["communityRecipeTitle"].waitForExistence(timeout: 10))
        app.buttons["communityRecipeMenu"].tap()
        app.buttons["Report recipe"].tap()
        let reason = app.buttons["Spam or scam"]
        XCTAssertTrue(reason.waitForExistence(timeout: 10))
        reason.tap()
        app.buttons["sendReport"].tap()
        // Sent through the server: no Mail sheet.
        let done = app.buttons["reportDone"]
        XCTAssertTrue(done.waitForExistence(timeout: 30), "The report should be sent through the server")
        attach("Report received")
        done.tap()

        // Back in the feed without it, and hidden on the server for the whole account.
        XCTAssertTrue(feed.waitForExistence(timeout: 10))
        XCTAssertFalse(card(target.title).exists)
        XCTAssertTrue(try isHidden(target))
        XCTAssertFalse(try recipes().contains { $0.id == target.id })
        assertNoErrors()

        // It's listed in Settings by its title, and unhiding brings it back.
        app.buttons["settingsButton"].firstMatch.tap()
        app.buttons["communitySettings"].tap()
        app.staticTexts["Blocked cooks and hidden recipes"].tap()
        let unhide = app.buttons["Unhide \(target.title)"]
        XCTAssertTrue(unhide.waitForExistence(timeout: 10), "Hidden recipes should list \(target.title)")
        attach("Hidden")
        unhide.tap()
        XCTAssertTrue(app.staticTexts["No hidden recipes."].waitForExistence(timeout: 10))
        XCTAssertFalse(try isHidden(target))
        goBack()
        goBack()
        app.buttons["Done"].tap()
        scrollToTop()
        // Pull to refresh: the feed on screen was loaded while the recipe was hidden.
        feed.swipeDown(velocity: .slow)
        XCTAssertTrue(card(try XCTUnwrap(all.first).title).waitForExistence(timeout: 20))
        XCTAssertTrue(scrollTo(card(target.title), swipes: 30), "\(target.title) should be back in the feed")
        assertNoErrors()
    }

    // MARK: Account

    func testSettingsShowTheServersCommunityAccount() throws {
        let name = try me().name
        try launch()
        XCTAssertTrue(feed.waitForExistence(timeout: 20))
        app.buttons["settingsButton"].firstMatch.tap()
        app.buttons["communitySettings"].tap()
        XCTAssertTrue(app.staticTexts["Connected on your server"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 10), "Settings should name the cook connected on the server")
        attach("Community account")
    }
}
