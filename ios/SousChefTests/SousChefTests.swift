import AuthenticationServices
import Foundation
import Testing
@testable import SousChef

struct UnitTests {
    @Test func convertsBetweenCompatibleUnits() {
        #expect(Units.convert(1, from: "kg", to: "g") == 1000)
        #expect(abs(Units.convert(1, from: "cup", to: "ml")! - 236.588) < 0.001)
        #expect(Units.convert(2, from: "tablespoons", to: "tbsp") == 2)
        #expect(Units.convert(1, from: "cup", to: "g") == nil)
        #expect(Units.convert(3, from: "banana", to: "banana") == 3)
    }

    @Test func parsesAmounts() {
        #expect(Units.parseAmount("1 1/2") == 1.5)
        #expect(Units.parseAmount("½") == 0.5)
        #expect(Units.parseAmount("1½") == 1.5)
        #expect(Units.parseAmount("0,5") == 0.5)
        #expect(Units.parseAmount("x") == nil)
    }

    @Test func formatsAmounts() {
        #expect(Units.amount(1.5, "cup") == "1½ cup")
        #expect(Units.amount(4, "each") == "4")
        #expect(Units.amount(nil, "to taste") == "to taste")
    }
}

struct CookingPlannerTests {
    private func stock(_ name: String, _ quantity: Double, _ unit: String, expires: Int? = nil) -> StockLine {
        StockLine(id: UUID(), name: name, quantity: quantity, unit: unit, expiresOn: expires.map { Date(timeIntervalSinceNow: Double($0) * 86_400) })
    }

    @Test func deductsAcrossUnitsAndReportsShortages() {
        let pasta = stock("Pasta", 0.5, "kg")
        let plan = CookingPlanner.plan(
            ingredients: [Ingredient(name: "pasta", quantity: 200, unit: "g"), Ingredient(name: "Basil", quantity: 1, unit: "bunch")],
            stock: [pasta])
        #expect(plan.deductions.count == 1)
        #expect(abs(plan.deductions[0].remaining - 0.3) < 0.000001)
        #expect(plan.missingIngredients == [.init(name: "Basil", quantity: 1, unit: "bunch")])
        #expect(plan.availableCount == 1)
    }

    @Test func usesSoonestExpiringBatchFirst() {
        let late = stock("Milk", 1, "l", expires: 10)
        let soon = stock("Milk", 1, "l", expires: 1)
        let plan = CookingPlanner.plan(ingredients: [Ingredient(name: "Milk", quantity: 500, unit: "ml")], stock: [late, soon])
        #expect(plan.deductions.map(\.id) == [soon.id])
    }

    @Test func skipsToTasteAndFlagsUnknownAmounts() {
        let plan = CookingPlanner.plan(
            ingredients: [Ingredient(name: "Salt", unit: "to taste"), Ingredient(name: "Eggs")],
            stock: [stock("Eggs", 6, "each")])
        #expect(plan.checks.map(\.name) == ["Eggs"])
        #expect(plan.missingIngredients.isEmpty)
        #expect(plan.deductions.isEmpty)
    }

    @Test func flagsIncomparableUnitsForManualCheck() {
        let plan = CookingPlanner.plan(ingredients: [Ingredient(name: "Butter", quantity: 2, unit: "tbsp")], stock: [stock("Butter", 1, "stick")])
        #expect(plan.checks.count == 1)
        #expect(plan.missingIngredients.isEmpty)
    }

    @Test func honorsIngredientMapping() {
        let plan = CookingPlanner.plan(ingredients: [Ingredient(name: "cheese", quantity: 50, unit: "g", mappingLabel: "Cheddar")],
                                       stock: [stock("Cheddar", 200, "g")])
        #expect(plan.isReady)
        #expect(plan.deductions.first?.remaining == 150)
    }
}

struct IngredientParserTests {
    @Test(arguments: [
        ("2 cups flour, sifted", "flour", 2.0, "cups", "sifted"),
        ("1 1/2 tsp salt", "salt", 1.5, "tsp", nil),
        ("½ cup milk", "milk", 0.5, "cup", nil),
        ("200g spaghetti", "spaghetti", 200.0, "g", nil),
        ("3 large eggs", "eggs", 3.0, "each", "large"),
        ("1 (14 oz) can tomatoes", "tomatoes", 1.0, "can", "14 oz"),
    ] as [(String, String, Double, String, String?)])
    func parsesLines(line: String, name: String, quantity: Double, unit: String, note: String?) {
        let parsed = IngredientParser.parse(line)
        #expect(parsed.name == name)
        #expect(parsed.quantity == quantity)
        #expect(parsed.unit == unit)
        #expect(parsed.note == note)
    }

    @Test func keepsRangesAsNotes() {
        let parsed = IngredientParser.parse("2-3 cloves garlic")
        #expect(parsed.name == "garlic")
        #expect(parsed.quantity == nil)
        #expect(parsed.note == "2–3 cloves")
    }

    @Test func neverInventsAmounts() {
        let parsed = IngredientParser.parse("Salt and pepper, to taste")
        #expect(parsed.quantity == nil)
        #expect(parsed.name == "Salt and pepper")
    }
}

struct RecipeImporterTests {
    @Test func readsSchemaOrgRecipes() throws {
        let html = """
        <html><head><title>Best Pancakes | Site</title>
        <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Fluffy Pancakes",
        "description":"Light &amp; fluffy.","recipeYield":["4 servings"],"prepTime":"PT10M","cookTime":"PT15M",
        "recipeIngredient":["2 cups flour","2 eggs","1 1/2 cups milk"],
        "recipeInstructions":[{"@type":"HowToStep","text":"Mix everything."},{"@type":"HowToStep","text":"Fry in batches."}],
        "nutrition":{"calories":"320 kcal"},"keywords":"breakfast, sweet","image":["https://example.com/p.jpg"]}]}</script>
        </head><body></body></html>
        """
        let result = try #require(RecipeImporter.fromHTML(html, pageURL: URL(string: "https://www.example.com/pancakes")!))
        #expect(result.recipe.title == "Fluffy Pancakes")
        #expect(result.recipe.summary == "Light & fluffy.")
        #expect(result.recipe.servings == 4)
        #expect(result.recipe.totalTimeMinutes == 25)
        #expect(result.recipe.ingredients.count == 3)
        #expect(result.recipe.ingredients[2].quantity == 1.5)
        #expect(result.recipe.steps.map(\.text) == ["Mix everything.", "Fry in batches."])
        #expect(result.recipe.caloriesKcal == 320)
        #expect(result.recipe.tags == ["breakfast", "sweet"])
        #expect(result.photoURL?.absoluteString == "https://example.com/p.jpg")
    }

    @Test func keepsStepsTheModelDropped() {
        var smart = RecipeDraft(title: "Biscuits")
        smart.ingredients = [Ingredient(name: "flour", quantity: 2, unit: "cups")]
        smart.steps = [RecipeStep(text: "Mix.")]
        var plain = RecipeDraft(title: "")
        plain.ingredients = [Ingredient(name: "flour", quantity: 2, unit: "cups")]
        plain.steps = [RecipeStep(text: "Mix."), RecipeStep(text: "Bake.")]
        let merged = RecipeTextReader.merged(smart: smart, plain: plain)
        #expect(merged.title == "Biscuits")
        #expect(merged.steps.map(\.text) == ["Mix.", "Bake."])
        #expect(RecipeTextReader.merged(smart: smart, plain: RecipeDraft()).steps.count == 1)
    }

    @Test func parsesDurations() {
        #expect(RecipeImporter.parseDuration("PT1H30M") == 90)
        #expect(RecipeImporter.parseDuration("P0DT45M") == 45)
        #expect(RecipeImporter.parseDuration("45 minutes") == nil)
        #expect(RecipeImporter.parseDuration("PT0M") == nil)
    }

    @Test func splitsInlineNumberedInstructions() {
        #expect(RecipeImporter.instructionLines("1. Mix. 2. Bake. 3. Serve.") == ["Mix.", "Bake.", "Serve."])
    }

    @Test func readsPlainTextRecipes() {
        let draft = RecipeTextReader.read("""
        Simple Omelette
        Serves 1
        Ingredients
        2 eggs
        10 g butter
        Instructions
        Whisk the eggs.
        Cook in butter for 3 minutes.
        """)
        #expect(draft.title == "Simple Omelette")
        #expect(draft.servings == 1)
        #expect(draft.ingredients.map(\.name) == ["eggs", "butter"])
        #expect(draft.steps.count == 2)
    }
}

struct MiscTests {
    @Test func findsTimersInSteps() {
        #expect(CookTimer.durations(in: "Simmer for 10 minutes, then bake 1-2 hours.") == [600, 7200])
        #expect(CookTimer.durations(in: "Serve immediately.").isEmpty)
    }

    @Test func detectsInsecureRemoteServers() throws {
        #expect(!ServerClient.isInsecureRemote(try ServerClient.normalize("192.168.1.20:3000")))
        #expect(!ServerClient.isInsecureRemote(try ServerClient.normalize("http://kitchen.local")))
        #expect(!ServerClient.isInsecureRemote(try ServerClient.normalize("http://nas.tail1234.ts.net")))
        #expect(!ServerClient.isInsecureRemote(try ServerClient.normalize("https://kitchen.example.com")))
        #expect(ServerClient.isInsecureRemote(try ServerClient.normalize("http://kitchen.example.com")))
    }

    @Test func readsSessionCookie() {
        #expect(ServerClient.cookieValue(in: "sous_chef_session=abc123; Path=/; HttpOnly") == "abc123")
        #expect(ServerClient.cookieValue(in: "other=1") == nil)
    }

    @Test func readsOpenFoodFactsNutrition() {
        let nutrition = Nutrition(json: ["energy-kcal_100g": 250, "proteins_100g": "7.5", "fat_100g": -1])
        #expect(nutrition.energyKcal == 250)
        #expect(nutrition.proteinG == 7.5)
        #expect(nutrition.fatG == nil)
    }

    @Test func picksTheProductBrand() {
        #expect(PantryPrefill.primaryBrand("Fairlife, The Coca-Cola Company") == "Fairlife")
        #expect(PantryPrefill.primaryBrand("Wild Fork") == "Wild Fork")
    }

    @Test func ignoresBinariesWithoutASignature() {
        #expect(Entitlements.fromCodeSignature(Data()) == nil)
        #expect(Entitlements.fromCodeSignature(Data(repeating: 0, count: 64)) == nil)
    }

    @Test func expiryShortcutsCountFromToday() {
        let week = ExpiryField.day(in: 7)
        #expect(Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: .now), to: week).day == 7)
    }

    @Test func infersCategories() {
        #expect(OpenFoodFacts.inferCategory(["en:dairies", "en:cheeses"]) == "Dairy")
        #expect(OpenFoodFacts.inferCategory(["en:unknown"]) == "Other")
    }
}

@MainActor
struct KitchenTests {
    @Test func cookingOfflineDeductsAndAddsShortages() async {
        let kitchen = Kitchen(inMemory: true)
        let pasta = PantryItem(name: "Pasta", quantity: 200, unit: "g")
        kitchen.context.insert(pasta)
        var draft = RecipeDraft(title: "Pasta")
        draft.ingredients = [Ingredient(name: "Pasta", quantity: 200, unit: "g"), Ingredient(name: "Basil", quantity: 1, unit: "bunch")]
        let recipe = kitchen.save(draft)
        let result = await kitchen.cook(recipe, addMissing: true)
        #expect(result.addedToShopping == 1)
        #expect(kitchen.fetch(PantryItem.self).isEmpty)
        #expect(kitchen.fetch(ShoppingItem.self).map(\.name) == ["Basil"])
        // The pasta is now used up, so it is newly missing; repeating the
        // action afterwards tops up rather than doubling the list.
        #expect(kitchen.addShortages(for: recipe) == 1)
        #expect(kitchen.addShortages(for: recipe) == 0)
        #expect(Set(kitchen.fetch(ShoppingItem.self).map(\.name)) == ["Basil", "Pasta"])
    }

    @Test func stockingFillsPlaceholdersAndLeavesTombstones() {
        let kitchen = Kitchen(inMemory: true)
        let placeholder = PantryItem(name: "Rice", quantity: 0, unit: "kg")
        kitchen.context.insert(placeholder)
        let bought = ShoppingItem(name: "rice", quantity: 2, unit: "kg")
        bought.serverID = "shoppingListItems_1"
        bought.checked = true
        kitchen.context.insert(bought)
        kitchen.stock([Kitchen.Purchase(item: bought, quantity: 2, unit: "kg", location: .pantry, expiresOn: nil)])
        #expect(kitchen.fetch(PantryItem.self).count == 1)
        #expect(placeholder.quantity == 2)
        #expect(kitchen.fetch(ShoppingItem.self).isEmpty)
        #expect(kitchen.fetch(Tombstone.self).map(\.serverID) == ["shoppingListItems_1"])
    }

    @Test func exportRoundTripsThroughImport() throws {
        let kitchen = Kitchen(inMemory: true)
        var draft = RecipeDraft(title: "Soup")
        draft.ingredients = [Ingredient(name: "Water", quantity: 1, unit: "l")]
        draft.steps = [RecipeStep(text: "Boil.")]
        kitchen.save(draft)
        let data = try kitchen.exportRecipes()
        let other = Kitchen(inMemory: true)
        #expect(try other.importRecipes(from: data) == 1)
        let imported = try #require(other.fetch(Recipe.self).first)
        #expect(imported.title == "Soup")
        #expect(imported.ingredients.first?.unit == "l")
        #expect(imported.steps.map(\.text) == ["Boil."])
    }
}

struct CommunityModerationTests {
    private func recipe(_ id: String, title: String = "Tomato soup", author: DTO.CommunityRecipe.Author? = .init(id: "user_1", name: "Ada"),
                        steps: [String] = ["Simmer."]) -> DTO.CommunityRecipe {
        DTO.CommunityRecipe(id: id, title: title, description: nil, tags: nil, servings: nil, totalTimeMinutes: nil, sourceUrl: nil,
                            photoUrl: nil, photoDataUrl: nil, ingredients: [.init(name: "Tomato", quantity: 4, unit: nil, note: nil)],
                            steps: steps.map { .init(text: $0) }, author: author, createdAt: nil)
    }

    private func isolatedDefaults() -> UserDefaults {
        let suite = "SousChefTests.moderation.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    @Test func filterMatchesWholeWordsCaseInsensitively() throws {
        let term = try #require(ContentFilter.terms.sorted().first)
        #expect(ContentFilter.isObjectionable("What a \(term.uppercased()) recipe!"))
        #expect(ContentFilter.isObjectionable("\(term)s everywhere"))
        #expect(!ContentFilter.isObjectionable("Scunthorpe shiitake cocktail"))
        #expect(!ContentFilter.isObjectionable("\(term)xyz"))
        #expect(ContentFilter.isObjectionable(recipe("r1", steps: ["Stir, then \(term)."])))
        #expect(!ContentFilter.isObjectionable(recipe("r2")))
    }

    @Test func guidelinesAcceptancePersists() {
        let defaults = isolatedDefaults()
        let moderation = CommunityModeration(defaults: defaults)
        #expect(!moderation.hasAcceptedGuidelines)
        moderation.acceptGuidelines()
        #expect(CommunityModeration(defaults: defaults).hasAcceptedGuidelines)
        #expect(defaults.integer(forKey: "community.guidelinesAccepted") == CommunityModeration.guidelinesVersion)
    }

    @Test func hidingAndUnhidingPersist() {
        let defaults = isolatedDefaults()
        let moderation = CommunityModeration(defaults: defaults)
        let soup = recipe("r1"), salad = recipe("r2", title: "Salad", author: .init(id: "user_2", name: "Grace"))
        moderation.hide(soup)
        #expect(moderation.visible([soup, salad]).map(\.id) == ["r2"])
        let reloaded = CommunityModeration(defaults: defaults)
        #expect(reloaded.hiddenRecipes == ["r1": "Tomato soup"])
        reloaded.unhide(id: "r1")
        #expect(CommunityModeration(defaults: defaults).visible([soup, salad]).count == 2)
    }

    @Test func blockingHidesEveryRecipeByTheAuthor() {
        let defaults = isolatedDefaults()
        let moderation = CommunityModeration(defaults: defaults)
        let ada = DTO.CommunityRecipe.Author(id: "user_1", name: "Ada")
        let recipes = [recipe("r1", author: ada), recipe("r2", author: ada), recipe("r3", author: .init(id: "user_2", name: "Ada"))]
        moderation.block(ada)
        // Same display name, different id: not blocked.
        #expect(moderation.visible(recipes).map(\.id) == ["r3"])
        let reloaded = CommunityModeration(defaults: defaults)
        #expect(reloaded.blockedAuthors == ["id:user_1": "Ada"])
        reloaded.unblock(key: "id:user_1")
        #expect(CommunityModeration(defaults: defaults).visible(recipes).count == 3)
    }

    @Test func blockingFallsBackToDisplayName() {
        let moderation = CommunityModeration(defaults: isolatedDefaults())
        moderation.block(.init(id: nil, name: "Anon Cook"))
        let sameName = DTO.CommunityRecipe.Author(id: nil, name: "anon cook")
        let withID = DTO.CommunityRecipe.Author(id: "user_9", name: "Anon Cook")
        #expect(moderation.isBlocked(sameName))
        #expect(moderation.isBlocked(withID) == false)
    }

    @Test func reportIncludesRecipeDetails() throws {
        let report = CommunityReport(recipe: recipe("r1"), reason: .spam, note: "  Links to a shop ", origin: "https://example.convex.site")
        #expect(report.subject == "Sous Chef community report: r1")
        #expect(report.body.contains("Title: Tomato soup"))
        #expect(report.body.contains("Author: Ada (user_1)"))
        #expect(report.body.contains("Reason: Spam or scam"))
        #expect(report.body.contains("Note: Links to a shop"))
        let url = try #require(report.mailtoURL)
        #expect(url.absoluteString.hasPrefix("mailto:george@georgevina.com?subject="))
    }
}

final class MemorySecretStore: SecretStore {
    var items: [String: Data] = [:]
    func read(_ account: String) -> Data? { items[account] }
    func write(_ data: Data, account: String) { items[account] = data }
    func delete(_ account: String) { items[account] = nil }
}

struct CommunityAccountTests {
    private func isolatedDefaults() -> UserDefaults {
        let name = "CommunityAccountTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private let session = CommunitySession(token: "token-1", userID: "user_1", name: "Ada", appleUserID: "000123.abc", origin: "https://example.convex.site")

    @Test func noncesAreRandomAndHashedAsHex() {
        let nonce = AppleNonce.random()
        #expect(nonce.count == 32)
        #expect(nonce != AppleNonce.random())
        #expect(nonce.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
        #expect(AppleNonce.sha256("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func buildsTheAppleSessionRequest() throws {
        let request = try CommunityAPI.sessionRequest(URL(string: "https://example.convex.site")!, identityToken: "id.token.sig",
                                                      authorizationCode: "code", rawNonce: "raw", fullName: nil)
        #expect(request.url?.absoluteString == "https://example.convex.site/api/v1/apple/session")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        let httpBody = try #require(request.httpBody)
        let body = try #require(JSONSerialization.jsonObject(with: httpBody) as? [String: Any])
        #expect(body["identityToken"] as? String == "id.token.sig")
        #expect(body["authorizationCode"] as? String == "code")
        #expect(body["nonce"] as? String == "raw")
        #expect(body["fullName"] == nil)
    }

    @Test func buildsThePublishPayload() throws {
        let snapshot = CommunitySnapshot(title: "  Tomato soup ", summary: " ", tags: ["quick", " "], servings: 4, totalTimeMinutes: 0,
                                         sourceURL: "javascript:alert(1)", photo: nil,
                                         ingredients: [Ingredient(name: "Tomatoes", quantity: 800, unit: "g", note: "ripe"), Ingredient(name: "  ")],
                                         steps: [RecipeStep(text: "Simmer."), RecipeStep(text: "")])
        let id = UUID()
        let payload = PublishPayload(id: nil, sourceKey: PublishPayload.sourceKey(for: id), snapshot: snapshot, visibility: "public")
        #expect(payload.sourceKey == PublishPayload.sourceKey(for: id))
        #expect(payload.sourceKey.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil)

        let request = try CommunityAPI.request(URL(string: "https://example.convex.site")!, "api/v1/publish", token: "secret", body: payload)
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer secret")
        let data = try #require(request.httpBody)
        #expect(String(decoding: data, as: UTF8.self).contains("null") == false)
        let json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(json["id"] == nil)
        #expect(json["visibility"] as? String == "public")
        let body = try #require(json["snapshot"] as? [String: Any])
        #expect(body["version"] as? Int == 1)
        #expect(body["title"] as? String == "Tomato soup")
        #expect(body["description"] == nil)
        #expect(body["tags"] as? [String] == ["quick"])
        #expect(body["servings"] as? Int == 4)
        #expect(body["totalTimeMinutes"] == nil)
        #expect(body["sourceUrl"] == nil)
        let ingredients = try #require(body["ingredients"] as? [[String: Any]])
        #expect(ingredients.count == 1)
        #expect(ingredients[0]["name"] as? String == "Tomatoes")
        #expect(ingredients[0]["note"] as? String == "ripe")
        #expect(ingredients[0]["id"] == nil)
        #expect((body["steps"] as? [[String: Any]])?.count == 1)
    }

    @Test func persistsTheSessionAndForgetsItOnSignOut() {
        let store = MemorySecretStore()
        let defaults = isolatedDefaults()
        let account = CommunityAccount(store: store, defaults: defaults, observeRevocation: false)
        #expect(account.isSignedIn == false)
        account.save(session)

        let relaunched = CommunityAccount(store: store, defaults: defaults, observeRevocation: false)
        #expect(relaunched.session == session)

        relaunched.signOut()
        #expect(relaunched.isSignedIn == false)
        #expect(store.items.isEmpty)
        #expect(CommunityAccount(store: store, defaults: defaults, observeRevocation: false).session == nil)
    }

    @Test func freshInstallIgnoresLeftoverKeychainSession() throws {
        let store = MemorySecretStore()
        store.write(try JSONEncoder().encode(session), account: "community.session")
        let account = CommunityAccount(store: store, defaults: isolatedDefaults(), observeRevocation: false)
        #expect(account.session == nil)
        #expect(store.items.isEmpty)
    }

    @Test func cancellingSignInShowsNoError() {
        #expect(CommunitySignInButton.message(for: ASAuthorizationError(.canceled)) == nil)
        #expect(CommunitySignInButton.message(for: ASAuthorizationError(.unknown)) != nil)
    }
}
