import Foundation
import Testing
@testable import SousChef

/// Where a new item starts: the name and category rules, and which source wins.
struct StoragePlacementTests {
    @Test(arguments: [
        ("milk", StorageLocation.fridge), ("Organic Whole Milk", .fridge), ("butter", .fridge), ("eggs", .fridge),
        ("chicken breast", .fridge), ("Chocolate milk", .fridge), ("spring mix", .fridge), ("spinach", .fridge), ("Strawberries", .fridge), ("Bell peppers", .fridge),
        ("orange juice", .fridge), ("sour cream", .fridge), ("Half & Half", .fridge), ("green beans", .fridge),
        ("UHT milk", .pantry), ("evaporated milk", .pantry), ("coconut milk", .pantry), ("peanut butter", .pantry),
        ("egg noodles", .pantry), ("chicken broth", .pantry), ("chicken soup", .pantry), ("mint tea", .pantry), ("Cream of Mushroom Soup", .pantry), ("milk chocolate", .pantry),
        ("long-life milk", .pantry), ("beef jerky", .pantry), ("fish sauce", .pantry), ("tomato paste", .pantry),
        ("rice", .pantry), ("potatoes", .pantry), ("Sweet potato", .pantry), ("green tea", .pantry), ("black pepper", .pantry),
        ("Tomatoes", .pantry), ("canned tuna", .pantry), ("cookies", .pantry),
        ("ice cream", .freezer), ("frozen peas", .freezer), ("Ice", .freezer), ("fish sticks", .freezer), ("Frozen pizza", .freezer),
        ("ice cubes", .freezer),
    ])
    func placesFoodByName(name: String, expected: StorageLocation) {
        #expect(StoragePlacement.suggest(name: name) == expected)
    }

    @Test func hasNoOpinionOnNamesItDoesNotKnow() {
        #expect(StoragePlacement.suggest(name: "Zorblat") == nil)
        #expect(StoragePlacement.suggest(name: "") == nil)
        #expect(StoragePlacement.suggest(name: "Zorblat", category: "Other") == nil)
        // Whole words only: an eggplant isn't an egg, rice isn't ice, and ice melt isn't food.
        #expect(StoragePlacement.suggestion(name: "Eggplant")?.basis == "eggplant")
        #expect(StoragePlacement.suggest(name: "Rice") == .pantry)
        #expect(StoragePlacement.suggest(name: "Ice melt") == nil)
    }

    /// The food is the last thing named, and the longer phrase wins a tie.
    @Test(arguments: [
        ("Chicken noodle soup", StorageLocation.pantry), ("Hot dog buns", .pantry), ("Hot dogs", .fridge),
        ("Tuna in water", .pantry), ("Yogurt with granola", .fridge), ("Tuna steak", .fridge),
        ("Macaroni and cheese", .pantry), ("Cheddar", .fridge), ("Ice cream cones", .pantry),
        ("Peppers", .fridge), ("Mints", .pantry), ("Fresh ginger", .fridge), ("Ground ginger", .pantry),
        ("Apple cider vinegar", .pantry), ("Cookie dough", .fridge), ("Salmon fillet (frozen)", .freezer),
        ("Sparkling water", .pantry), ("Dog food", .pantry), ("Egg rolls", .freezer),
    ])
    func readsTheFoodFromTheWholeName(name: String, expected: StorageLocation) {
        #expect(StoragePlacement.suggest(name: name) == expected)
    }

    @Test func fallsBackToTheCategory() {
        #expect(StoragePlacement.suggest(name: "Zorblat", category: "Dairy") == .fridge)
        #expect(StoragePlacement.suggest(name: "Zorblat", category: "Meat & Seafood") == .fridge)
        #expect(StoragePlacement.suggest(name: "Zorblat", category: "Produce") == .fridge)
        #expect(StoragePlacement.suggest(name: "Zorblat", category: "Frozen") == .freezer)
        #expect(StoragePlacement.suggest(name: "Zorblat", category: "Snacks") == .pantry)
        // The name wins: potatoes are produce that keeps in the pantry.
        #expect(StoragePlacement.suggest(name: "Potatoes", category: "Produce") == .pantry)
        // Every category the pickers offer has an answer, except the two that could be anywhere.
        #expect(StoragePlacement.suggest(name: "Zorblat", category: "Beverages") == nil)
        for category in ShoppingCategories.all where category != "Other" && category != "Beverages" {
            #expect(StoragePlacement.suggest(name: "Zorblat", category: category) != nil)
        }
    }

    @Test func saysWhatDecidedIt() {
        #expect(StoragePlacement.suggestion(name: "Organic Whole Milk")?.basis == "milk")
        #expect(StoragePlacement.suggestion(name: "Zorblat", category: "Dairy")?.basis == "Dairy")
    }

    @Test func foldsSimplePlurals() {
        for (plural, singular) in [("potatoes", "potato"), ("berries", "berry"), ("cookies", "cookie"), ("cheeses", "cheese"),
                                   ("eggs", "egg"), ("peas", "pea"), ("sandwiches", "sandwich"), ("turkeys", "turkey")] {
            #expect(FoodWords.stem(plural) == FoodWords.stem(singular))
        }
        #expect(FoodWords.stem("pasta") != FoodWords.stem("paste"))
        #expect(FoodWords.stem("swiss") == "swiss")
    }

    // MARK: Which source wins

    @Test func theFilterBeatsEveryGuess() {
        var choice = LocationChoice()
        choice.offer(.fridge, from: .filter)
        do { let taken = choice.offer(.freezer, from: .label); #expect(!taken) }
        do { let taken = choice.offer(.freezer, from: .stockedBefore); #expect(!taken) }
        do { let taken = choice.offer(.freezer, from: .product); #expect(!taken) }
        choice.refresh(name: "Ice cream", category: "Frozen", refill: (.freezer, "Ice cream"))
        do { let taken = choice.answer(.freezer, asked: "Ice cream", name: "Ice cream"); #expect(!taken) }
        #expect(choice.location == .fridge && choice.source == .filter)
        #expect(choice.reason == "Matches your Fridge filter")
    }

    @Test func thePersonsPickIsNeverOverridden() {
        var choice = LocationChoice()
        choice.offer(.fridge, from: .filter)
        choice.pick(.freezer)
        do { let taken = choice.offer(.fridge, from: .filter); #expect(!taken) }
        choice.refresh(name: "Milk", category: "Dairy")
        #expect(choice.location == .freezer && choice.source == .user)
        #expect(choice.reason == nil)
    }

    @Test func anExistingItemNeverMoves() {
        var choice = LocationChoice(editing: .pantry)
        choice.offer(.fridge, from: .label)
        choice.refresh(name: "Milk", category: "Dairy", refill: (.fridge, "Milk"))
        #expect(choice.location == .pantry)
    }

    @Test func strongerSourcesReplaceWeakerOnes() {
        var choice = LocationChoice()
        #expect(choice.location == .pantry && choice.source == .fallback && choice.reason == nil)
        do { let taken = choice.answer(.freezer, asked: "Zorblat", name: "zorblat "); #expect(taken) }
        #expect(choice.reason == "Suggested by Apple Intelligence")
        choice.refresh(name: "Milk", category: nil)
        #expect(choice.location == .fridge && choice.source == .rule)
        #expect(choice.reason == "Suggested for milk")
        do { let taken = choice.answer(.freezer, asked: "Milk", name: "Milk"); #expect(!taken) }
        do { let taken = choice.offer(.pantry, from: .product); #expect(taken) }
        #expect(choice.reason == "From the product's storage details")
        do { let taken = choice.offer(.freezer, from: .stockedBefore); #expect(taken) }
        #expect(choice.reason == "Where you kept it last time")
        do { let taken = choice.offer(.pantry, from: .product); #expect(!taken) }
        do { let taken = choice.offer(.fridge, from: .label); #expect(taken) }
        do { let taken = choice.offer(.pantry, from: .filter); #expect(taken) }
        #expect(choice.location == .pantry && choice.source == .filter)
    }

    @Test func theNameRuleFollowsTyping() {
        var choice = LocationChoice()
        choice.refresh(name: "Mil", category: nil)
        #expect(choice.source == .fallback && choice.wantsAI(name: "Mil"))
        choice.refresh(name: "Milk", category: nil)
        #expect(choice.location == .fridge && !choice.wantsAI(name: "Milk"))
        choice.refresh(name: "Milk powder", category: nil)
        #expect(choice.location == .pantry && choice.source == .rule)
        // Changing it to something unknown drops the earlier suggestion.
        choice.refresh(name: "Zorblat", category: nil)
        #expect(choice.location == .pantry && choice.source == .fallback)
        choice.refresh(name: "Zorblat", category: "Frozen")
        #expect(choice.location == .freezer && choice.reason == "Suggested for Frozen")
    }

    @Test func appleIntelligenceOnlyFillsTheGap() {
        var choice = LocationChoice()
        #expect(!choice.wantsAI(name: "ab"))
        #expect(choice.wantsAI(name: "Zorblat"))
        // An answer for a name that has since changed is dropped.
        do { let taken = choice.answer(.fridge, asked: "Zorb", name: "Zorblat"); #expect(!taken) }
        // Unsure is no answer.
        do { let taken = choice.answer(nil, asked: "Zorblat", name: "Zorblat"); #expect(!taken) }
        do { let taken = choice.answer(.fridge, asked: "Zorblat", name: "Zorblat"); #expect(taken) }
        #expect(!choice.wantsAI(name: "Zorblat"))
        // It survives a category change that says nothing, but not a new name.
        choice.refresh(name: "Zorblat", category: "Other")
        #expect(choice.location == .fridge && choice.source == .ai)
        choice.refresh(name: "Zorblats", category: nil)
        #expect(choice.source == .fallback && choice.location == .pantry)
        // A stronger source that arrived first wins over a late answer.
        choice.offer(.freezer, from: .stockedBefore)
        do { let taken = choice.answer(.fridge, asked: "Zorblats", name: "Zorblats"); #expect(!taken) }
        #expect(choice.location == .freezer)
    }

    @Test func refillingUsesTheItemsPlaceUnlessSomethingStrongerKnows() {
        var choice = LocationChoice()
        choice.refresh(name: "Milk", category: nil, refill: (.pantry, "Milk"))
        #expect(choice.location == .pantry && choice.source == .refill)
        #expect(choice.reason == "Where the item you're refilling is kept")
        // Switching the refill off brings the name rule back.
        choice.refresh(name: "Milk", category: nil, refill: nil)
        #expect(choice.location == .fridge && choice.source == .rule)

        var scanned = LocationChoice()
        scanned.offer(.freezer, from: .product)
        scanned.refresh(name: "Milk", category: nil, refill: (.pantry, "Milk"))
        #expect(scanned.location == .freezer && scanned.source == .product)
    }

    // MARK: Open Food Facts

    @Test func aCategoryThatSaysNothingIsOnlyAGuess() {
        let guess = ProductParser.storageEvidence(conditions: nil, categories: ["en:beverages", "en:plant-based-foods"])
        #expect(guess?.location == .pantry && guess?.positive == false)
        #expect(ProductParser.storage(conditions: nil, categories: ["en:beverages"]) == .pantry)
        #expect(ProductParser.storageEvidence(conditions: nil, categories: ["en:dairies", "en:uht-milks"])?.positive == true)
        #expect(ProductParser.storageEvidence(conditions: nil, categories: ["en:frozen-foods"])?.positive == true)
        #expect(ProductParser.storageEvidence(conditions: "Store in a cool, dry place.", categories: nil)?.positive == true)
        #expect(ProductParser.storageEvidence(conditions: nil, categories: nil) == nil)

        var facts = FoodFacts()
        facts.storage = "pantry"
        facts.categoriesTags = ["en:beverages"]
        #expect(ProductParser.defaults(facts).location == .pantry)
        #expect(!ProductParser.defaults(facts).locationIsEvidence)
        facts.storageText = "Store in a cool, dry place."
        #expect(ProductParser.defaults(facts).locationIsEvidence)
        facts = FoodFacts()
        facts.storage = "fridge"
        #expect(ProductParser.defaults(facts).locationIsEvidence)
        #expect(!ProductParser.defaults(nil).locationIsEvidence)
    }

    @Test func purchasesAreShelvedByNameThenAisle() {
        let potatoes = ShoppingItem(name: "Potatoes")
        potatoes.category = "Produce"
        #expect(StockPurchasesView.guessLocation(potatoes) == .pantry)
        let lettuce = ShoppingItem(name: "Lettuce")
        lettuce.category = "Produce"
        #expect(StockPurchasesView.guessLocation(lettuce) == .fridge)
        let unknown = ShoppingItem(name: "Zorblat")
        #expect(StockPurchasesView.guessLocation(unknown) == .pantry)
        unknown.category = "Frozen"
        #expect(StockPurchasesView.guessLocation(unknown) == .freezer)
    }
}
