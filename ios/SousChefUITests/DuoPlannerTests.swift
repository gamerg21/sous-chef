import XCTest

/// The week planner beside the recipe library on a wide screen, such as an
/// unfolded iPhone Duo: recipes drag onto a day's meal, and planned meals
/// drag to another. Skipped on narrow screens, which don't show the planner.
@MainActor
final class DuoPlannerTests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments = ["-uiTesting", "-seedSample", "-startTab", "recipes"]
        app.launch()
        guard app.windows.firstMatch.frame.width >= 700 else {
            throw XCTSkip("The planner shows only on wide screens; unfold the iPhone Duo.")
        }
    }

    private func day(_ offset: Int) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Calendar.current.date(byAdding: .day, value: offset, to: .now)!)
    }

    private func well(_ offset: Int, _ slot: String) -> XCUIElement {
        app.descendants(matching: .any)["planWell-\(day(offset))-\(slot)"]
    }

    func testDragsARecipeOntoADayAndMovesIt() throws {
        // Today's lunch is empty in the sample week.
        let lunch = well(0, "lunch")
        XCTAssertTrue(lunch.waitForExistence(timeout: 10))
        XCTAssertFalse(lunch.buttons["Lunch, Fluffy pancakes"].exists)

        let card = app.buttons.containing(.staticText, identifier: "Fluffy pancakes").firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        card.press(forDuration: 1.0, thenDragTo: lunch, withVelocity: .slow, thenHoldForDuration: 0.6)

        let planned = lunch.buttons["Lunch, Fluffy pancakes"]
        XCTAssertTrue(planned.waitForExistence(timeout: 5))
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Planned"
        shot.lifetime = .keepAlways
        add(shot)

        // Then to yesterday's breakfast, higher up, so holding near the
        // bottom edge doesn't scroll the week (tomorrow's on the first day).
        let firstDay = Calendar.current.component(.weekday, from: .now) == Calendar.current.firstWeekday
        let breakfast = well(firstDay ? 1 : -1, "breakfast")
        planned.press(forDuration: 1.0, thenDragTo: breakfast, withVelocity: .slow, thenHoldForDuration: 0.6)
        XCTAssertTrue(breakfast.buttons["Breakfast, Fluffy pancakes"].waitForExistence(timeout: 5))
        XCTAssertFalse(lunch.buttons["Lunch, Fluffy pancakes"].exists)
    }

    func testOpensAPlannedMealBesideThePlan() throws {
        let dinner = well(0, "dinner").buttons["Dinner, Thai green curry"]
        XCTAssertTrue(dinner.waitForExistence(timeout: 10))
        dinner.tap()
        XCTAssertTrue(app.staticTexts["Creamy, fragrant and ready in half an hour."].waitForExistence(timeout: 5))
        // The plan stays beside the recipe.
        XCTAssertTrue(dinner.exists)
    }
}
