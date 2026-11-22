import XCTest

/// Where the add form puts a new item: in the location the Pantry list is
/// filtered to, otherwise where that kind of food normally goes. Needs no
/// network. The filter test uses the summary tiles, which a wide screen
/// replaces with the pane beside the list.
@MainActor
final class PantryPlacementTests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments = ["-uiTesting", "-seedSample", "-startTab", "pantry"]
        app.launch()
    }

    private func location(_ title: String) -> XCUIElement {
        let picker = app.segmentedControls["pantryLocation"]
        return (picker.exists ? picker : app.segmentedControls.firstMatch).buttons[title]
    }

    private var nameField: XCUIElement { app.descendants(matching: .any)["pantryName"].firstMatch }

    func testANewItemStartsInTheFilteredLocation() throws {
        let fridge = app.buttons["pantryScope-fridge"]
        guard fridge.waitForExistence(timeout: 10) else {
            throw XCTSkip("The location tiles show only on narrow screens.")
        }
        fridge.tap()
        app.buttons["addPantryItem"].firstMatch.tap()
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        XCTAssertTrue(location("Fridge").isSelected)
        XCTAssertTrue(app.staticTexts["Matches your Fridge filter"].exists)

        // A cupboard food doesn't move it out of the filtered location.
        nameField.tap()
        nameField.typeText("Rice")
        XCTAssertTrue(location("Fridge").isSelected)
        XCTAssertTrue(app.staticTexts["Matches your Fridge filter"].exists)
    }

    func testTheNameSuggestsALocationUntilThePersonPicksOne() throws {
        app.buttons["addPantryItem"].firstMatch.tap()
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        XCTAssertTrue(location("Pantry").isSelected)
        nameField.tap()
        nameField.typeText("Ice cream")
        XCTAssertTrue(app.staticTexts["Suggested for ice cream"].waitForExistence(timeout: 5))
        XCTAssertTrue(location("Freezer").isSelected)

        // Their own pick stays, whatever is typed next.
        location("Fridge").tap()
        XCTAssertFalse(app.staticTexts["Suggested for ice cream"].exists)
        nameField.typeText(" cake")
        XCTAssertTrue(location("Fridge").isSelected)
    }

    func testRefillsAnItemAlreadyInTheKitchenInsteadOfAddingAnother() throws {
        // The sample kitchen has 12 eggs (Vital Farms) in the fridge.
        let plus = app.buttons["addPantryItem"].firstMatch
        XCTAssertTrue(plus.waitForExistence(timeout: 10))
        plus.tap()
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        nameField.tap()
        nameField.typeText("Egg")

        // In stock, so refilling is offered but left off.
        let toggle = app.switches["refillExisting"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        let match = app.descendants(matching: .any)["refillMatch"].firstMatch
        XCTAssertTrue(match.exists)
        let described = [match.label, match.value as? String ?? ""].joined(separator: " ")
        XCTAssertTrue(described.contains("12 · Fridge"), described)
        XCTAssertEqual(toggle.value as? String, "0")
        toggle.tap()
        if toggle.value as? String != "1" { toggle.switches.firstMatch.tap() }
        XCTAssertEqual(toggle.value as? String, "1")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Refill"
        shot.lifetime = .keepAlways
        add(shot)

        app.buttons["savePantryItem"].tap()
        // The eggs gained one, and no second item was added.
        let rows = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Egg'"))
        let list = app.collectionViews.firstMatch
        XCTAssertTrue(list.waitForExistence(timeout: 5))
        for _ in 0..<8 where !rows.firstMatch.exists { list.swipeUp() }
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(rows.firstMatch.label.hasSuffix(", 13"), rows.firstMatch.label)
    }
}
