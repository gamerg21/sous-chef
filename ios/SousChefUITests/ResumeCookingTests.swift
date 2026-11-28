import XCTest

/// Closing cook mode sets the recipe aside: the step and the timers are still
/// there from the bar above the tab bar. Needs no network.
@MainActor
final class ResumeCookingTests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments = ["-uiTesting", "-seedSample", "-startTab", "recipes"]
        app.launch()
    }

    private var resumeBar: XCUIElement { app.buttons["resumeCooking"].firstMatch }

    /// Opens a sample recipe from the library and taps Start (or Resume) cooking.
    private func startCooking(_ title: String) {
        let card = app.staticTexts[title].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        card.tap()
        XCTAssertTrue(app.buttons["startCooking"].waitForExistence(timeout: 5))
        app.buttons["startCooking"].tap()
    }

    /// Steps forward until cook mode says it's on `step`. A wide screen
    /// starts on the first step, a narrow one on the ingredients.
    private func advance(toStep step: Int, of count: Int) {
        let place = app.staticTexts["Step \(step) of \(count)"]
        XCTAssertTrue(app.buttons["nextStep"].waitForExistence(timeout: 5))
        for _ in 0...step where !place.exists { app.buttons["nextStep"].tap() }
        XCTAssertTrue(place.waitForExistence(timeout: 3))
    }

    private func closeCookMode() {
        app.navigationBars.buttons["Close"].firstMatch.tap()
        XCTAssertTrue(app.buttons["nextStep"].waitForNonExistence(timeout: 5))
    }

    /// The first timer asks to allow alarms and notifications.
    private func answerPermissionPrompts() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for _ in 0..<3 {
            let alert = springboard.alerts.firstMatch
            guard alert.waitForExistence(timeout: 2) else { return }
            let allow = alert.buttons["Allow"]
            (allow.exists ? allow : alert.buttons.element(boundBy: alert.buttons.count - 1)).tap()
        }
    }

    func testClosingCookModeKeepsTheStepAndItsTimer() throws {
        startCooking("Penne all'arrabbiata")
        advance(toStep: 1, of: 4)
        app.buttons["Start 10-minute timer"].firstMatch.tap()
        answerPermissionPrompts()
        advance(toStep: 2, of: 4)
        closeCookMode()

        // Set aside, not lost: the bar names the recipe and the step.
        XCTAssertTrue(resumeBar.waitForExistence(timeout: 5))
        XCTAssertTrue(resumeBar.label.contains("Penne all'arrabbiata"), resumeBar.label)
        XCTAssertTrue(resumeBar.label.contains("Step 2 of 4"), resumeBar.label)
        XCTAssertEqual(app.buttons["startCooking"].label, "Resume cooking")

        resumeBar.tap()
        XCTAssertTrue(app.staticTexts["Step 2 of 4"].waitForExistence(timeout: 5))
        XCTAssertFalse(resumeBar.exists)
        // The timer kept counting while cook mode was closed.
        XCTAssertTrue(app.buttons["Remove Step 1 timer"].firstMatch.waitForExistence(timeout: 3))
    }

    func testStoppingFromTheBarEndsTheRecipe() throws {
        startCooking("Penne all'arrabbiata")
        advance(toStep: 2, of: 4)
        closeCookMode()
        XCTAssertTrue(resumeBar.waitForExistence(timeout: 5))

        app.buttons["stopCooking"].firstMatch.tap()
        XCTAssertTrue(app.buttons["confirmStopCooking"].waitForExistence(timeout: 5))
        app.buttons["confirmStopCooking"].tap()
        XCTAssertTrue(resumeBar.waitForNonExistence(timeout: 5))
        XCTAssertEqual(app.buttons["startCooking"].label, "Start cooking")
    }

    func testJustLookingAtARecipeLeavesNothingToResume() throws {
        startCooking("Penne all'arrabbiata")
        advance(toStep: 1, of: 4)
        closeCookMode()
        XCTAssertFalse(resumeBar.waitForExistence(timeout: 2))
    }

    func testStartingAnotherRecipeAsksFirst() throws {
        startCooking("Penne all'arrabbiata")
        advance(toStep: 2, of: 4)
        closeCookMode()
        XCTAssertTrue(resumeBar.waitForExistence(timeout: 5))

        // Back in the library, a recipe from the top row: the bar covers
        // whatever has scrolled under it.
        app.navigationBars.buttons.firstMatch.tap()
        startCooking("Garden salad")
        let switchRecipe = app.buttons["switchRecipe"]
        XCTAssertTrue(switchRecipe.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["You're still cooking Penne all'arrabbiata"].exists)

        // Keeping the first recipe leaves it where it was.
        app.buttons["Keep cooking"].tap()
        XCTAssertTrue(resumeBar.waitForExistence(timeout: 5))
        XCTAssertTrue(resumeBar.label.contains("Penne all'arrabbiata"), resumeBar.label)

        app.buttons["startCooking"].tap()
        XCTAssertTrue(switchRecipe.waitForExistence(timeout: 5))
        switchRecipe.tap()
        XCTAssertTrue(app.navigationBars["Garden salad"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["nextStep"].exists)
    }
}
