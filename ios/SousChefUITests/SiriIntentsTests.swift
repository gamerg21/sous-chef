import AppIntentsTesting
import UniformTypeIdentifiers
import XCTest

/// Runs the Siri and Shortcuts intents out of process, through the same App
/// Intents machinery Siri uses, against a known in-memory kitchen.
@MainActor
final class SiriIntentsTests: XCTestCase {
    private let app = XCUIApplication()
    private var definitions: IntentDefinitions!

    override func setUp() async throws {
        continueAfterFailure = false
        app.launchArguments = ["-uiTesting"]
        app.launch()
        definitions = IntentDefinitions(bundleIdentifier: "com.georgevina.souschef")
        _ = try await definitions.intents["ResetKitchenForTestsIntent"].makeIntent().run()
    }

    private func names(_ result: ResolvedIntentResult) throws -> [String] {
        let entities: [AnyAppEntity] = try result.value
        return try entities.map { try $0.name }
    }

    func testChecksPantryByLocation() async throws {
        let all = try await definitions.intents["ShowPantryIntent"].makeIntent().run()
        XCTAssertEqual(try names(all), ["Spinach", "Garlic", "Pasta", "Whole milk"])

        let fridge = definitions.enums["StorageLocationEntity"].makeCase("fridge")
        let inFridge = try await definitions.intents["ShowPantryIntent"].makeIntent(location: fridge).run()
        XCTAssertEqual(try names(inFridge), ["Spinach", "Whole milk"])
    }

    func testListsFoodExpiringSoon() async throws {
        let result = try await definitions.intents["ExpiringSoonIntent"].makeIntent(days: 3).run()
        XCTAssertEqual(try names(result), ["Spinach"])
    }

    func testSuggestsTheRecipeThePantryCovers() async throws {
        let result = try await definitions.intents["SuggestRecipeIntent"].makeIntent().run()
        let recipes: [AnyAppEntity] = try result.value
        XCTAssertEqual(try recipes.map { try $0.title as String }, ["Spinach Pasta", "Pesto Pasta"])
    }

    func testAddsSpokenItemsAndChecksThemOff() async throws {
        let added = try await definitions.intents["AddToShoppingListIntent"].makeIntent(items: "eggs, bread and mac and cheese").run()
        XCTAssertEqual(try names(added), ["eggs", "bread", "mac and cheese"])

        _ = try await definitions.intents["CheckOffShoppingItemIntent"].makeIntent(item: "Bread").run()
        let list = try await definitions.intents["ShowShoppingListIntent"].makeIntent().run()
        XCTAssertEqual(try names(list), ["eggs", "mac and cheese"])
    }

    func testRunningOutMovesFoodToTheList() async throws {
        _ = try await definitions.intents["RanOutIntent"].makeIntent(food: "whole milk").run()
        let list = try await definitions.intents["ShowShoppingListIntent"].makeIntent().run()
        XCTAssertEqual(try names(list), ["Whole milk"])
        let fridge = definitions.enums["StorageLocationEntity"].makeCase("fridge")
        let inFridge = try await definitions.intents["ShowPantryIntent"].makeIntent(location: fridge).run()
        XCTAssertEqual(try names(inFridge), ["Spinach"])
    }

    func testFindsRecipesByNameAndShopsForThem() async throws {
        let recipes = definitions.entities["RecipeEntity"]
        let matches = try await recipes.entities(matching: "pesto")
        XCTAssertEqual(matches.count, 1)
        let pesto = try XCTUnwrap(matches.first)

        let added = try await definitions.intents["AddRecipeShortagesIntent"].makeIntent(recipe: pesto).run()
        XCTAssertEqual(Set(try names(added)), ["Basil", "Pine nuts"])
        // Asking again doesn't double the list.
        _ = try await definitions.intents["AddRecipeShortagesIntent"].makeIntent(recipe: pesto).run()
        let list = try await definitions.intents["ShowShoppingListIntent"].makeIntent().run()
        XCTAssertEqual(try names(list).count, 2)
    }

    func testRecipesAreInSpotlight() async throws {
        let indexed = try await definitions.entities["RecipeEntity"].spotlightQuery("Spinach")
        XCTAssertTrue(try indexed.contains { try $0.title == "Spinach Pasta" })
    }

    func testRecipesShareAsText() async throws {
        let found = try await definitions.entities["RecipeEntity"].entities(matching: "Spinach Pasta")
        let recipe = try XCTUnwrap(found.first)
        let file = try await recipe.exported(as: .plainText)
        let text = String(decoding: file.data, as: UTF8.self)
        XCTAssertTrue(text.hasPrefix("Spinach Pasta"))
        XCTAssertTrue(text.contains("• 200 g Pasta"))
    }

    func testOpeningARecipeShowsIt() async throws {
        let found = try await definitions.entities["RecipeEntity"].entities(matching: "Pesto Pasta")
        let recipe = try XCTUnwrap(found.first)
        _ = try await definitions.intents["OpenRecipeIntent"].makeIntent(target: recipe).run()
        XCTAssertTrue(app.buttons["startCooking"].waitForExistence(timeout: 5))
        let onScreen = try await definitions.entities["RecipeEntity"].viewAnnotations()
        XCTAssertEqual(try onScreen.map { try $0.entity.title as String }, ["Pesto Pasta"])
    }

    func testStartCookingOpensCookModeForThatRecipe() async throws {
        let recipes = definitions.entities["RecipeEntity"]
        let pestoMatches = try await recipes.entities(matching: "Pesto Pasta")
        let pesto = try XCTUnwrap(pestoMatches.first)
        _ = try await definitions.intents["OpenRecipeIntent"].makeIntent(target: pesto).run()
        XCTAssertTrue(app.buttons["startCooking"].waitForExistence(timeout: 5))

        // Asking for a different recipe while one is open cooks the one asked for.
        let spinachMatches = try await recipes.entities(matching: "Spinach Pasta")
        let spinach = try XCTUnwrap(spinachMatches.first)
        _ = try await definitions.intents["StartCookingIntent"].makeIntent(recipe: spinach).run()
        XCTAssertTrue(app.buttons["nextStep"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Spinach Pasta"].exists)
    }

    func testSavesRecipeTextAndFindsItByName() async throws {
        let text = """
        Lemon Rice
        Ingredients
        1 cup rice
        2 cups water
        1 lemon
        Steps
        Simmer the rice in the water for 15 minutes.
        Stir in the lemon juice.
        """
        let result = try await definitions.intents["SaveRecipeFromTextIntent"].makeIntent(text: text).run()
        let saved: AnyAppEntity = try result.value
        let title: String = try saved.title
        XCTAssertFalse(title.isEmpty)
        let found = try await definitions.entities["RecipeEntity"].entities(matching: title)
        XCTAssertEqual(found.count, 1)
    }
}
