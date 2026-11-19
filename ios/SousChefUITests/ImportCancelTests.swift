import XCTest

/// Cancelling the review of an imported or suggested recipe goes back to
/// what it came from, so a prompt or pasted text doesn't need retyping.
@MainActor
final class ImportCancelTests: XCTestCase {
    private let app = XCUIApplication()

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments = ["-uiTesting", "-seedSample", "-startTab", "recipes"]
        app.launch()
    }

    func testCancellingTheReviewKeepsThePastedText() throws {
        let recipe = "Garlic Toast\nIngredients\n2 slices bread\n1 clove garlic\nSteps\nToast the bread.\nRub with garlic."
        app.buttons["addRecipe"].firstMatch.tap()
        app.buttons["Paste recipe text"].tap()
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        editor.tap()
        editor.typeText(recipe)
        app.buttons["importAction"].tap()

        let save = app.buttons["saveRecipe"]
        XCTAssertTrue(save.waitForExistence(timeout: 30))
        app.buttons["Cancel"].firstMatch.tap()
        let discard = app.buttons["confirmDiscard"]
        if discard.waitForExistence(timeout: 3) { discard.tap() }

        // Back on the form, not the library, with the text still there.
        XCTAssertTrue(app.buttons["importAction"].waitForExistence(timeout: 5))
        XCTAssertFalse(save.exists)
        let value = app.textViews.firstMatch.value as? String ?? ""
        XCTAssertTrue(value.contains("Rub with garlic."), "Form lost the pasted text: \(value)")
    }
}
