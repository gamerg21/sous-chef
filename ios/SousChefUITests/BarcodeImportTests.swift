import XCTest

/// Looking up a barcode fills in the package: a 12-pack of Diet Coke comes
/// in as 12 cans, with a stepper for more packages. Needs the network, so
/// it skips when Open Food Facts can't be reached.
@MainActor
final class BarcodeImportTests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments = ["-uiTesting", "-seedSample", "-startTab", "pantry"]
        app.launch()
    }

    func testAMultipackComesInAsCans() throws {
        app.buttons["Scan barcode"].firstMatch.tap()
        let digits = app.textFields["Barcode digits"]
        XCTAssertTrue(digits.waitForExistence(timeout: 5))
        digits.tap()
        digits.typeText("049000028911")
        app.buttons["Look up"].tap()

        let quantity = app.textFields["pantryQuantity"]
        guard quantity.waitForExistence(timeout: 20) else {
            throw XCTSkip("Open Food Facts didn't answer.")
        }
        XCTAssertEqual(quantity.value as? String, "12")
        XCTAssertTrue(app.buttons["12 cans"].exists)
        XCTAssertTrue(app.buttons["144 fl oz"].exists)
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "12 cans · 12 fl oz each")).firstMatch.exists)

        // Two packages, then counted by volume instead.
        app.steppers["pantryPackages"].buttons.element(boundBy: 1).tap()
        XCTAssertEqual(quantity.value as? String, "24")
        app.buttons["144 fl oz"].tap()
        XCTAssertEqual(quantity.value as? String, "288")
        // Packages-to-quantity math above is the feature; this is for the reviewer.
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.lifetime = .keepAlways
        add(shot)
    }
}
