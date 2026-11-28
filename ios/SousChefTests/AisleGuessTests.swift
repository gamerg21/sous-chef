import Foundation
import Testing
@testable import SousChef

/// The aisle a shopping item is filed under from its name alone.
struct AisleGuessTests {
    @Test(arguments: [
        ("Red chili", "Produce"), ("Red chilies", "Produce"), ("Green chillies", "Produce"), ("Chile", "Produce"),
        ("jalapeño", "Produce"), ("Jalapeños", "Produce"), ("scallions", "Produce"), ("Shallot", "Produce"),
        ("garlic", "Produce"), ("Garlic cloves", "Produce"), ("tomato", "Produce"), ("Tomatoes", "Produce"),
        ("Cherry tomatoes", "Produce"), ("lemon", "Produce"), ("Berries", "Produce"), ("Strawberries", "Produce"),
        ("Zucchini", "Produce"), ("Broccoli", "Produce"), ("Cabbage", "Produce"), ("Kale", "Produce"),
        ("basil", "Produce"), ("Thai basil", "Produce"), ("Red onion", "Produce"), ("Bell peppers", "Produce"),
        ("milk", "Dairy"), ("Oat milk", "Dairy"), ("butter", "Dairy"), ("Unsalted butter", "Dairy"), ("eggs", "Dairy"),
        ("Cream cheese", "Dairy"), ("Half & Half", "Dairy"),
        ("chicken", "Meat & Seafood"), ("Chicken thighs", "Meat & Seafood"), ("Ground beef", "Meat & Seafood"),
        ("steak", "Meat & Seafood"), ("Hot dogs", "Meat & Seafood"), ("Prawns", "Meat & Seafood"),
        ("bread", "Bakery"), ("Hot dog buns", "Bakery"), ("Corn tortillas", "Bakery"),
        ("penne", "Pasta & Noodles"), ("Egg noodles", "Pasta & Noodles"), ("Lasagne sheets", "Pasta & Noodles"),
        ("rice", "Grains & Rice"), ("Rolled oats", "Grains & Rice"), ("Corn flakes", "Grains & Rice"),
        ("green tea", "Beverages"), ("Coffee beans", "Beverages"), ("Sparkling water", "Beverages"),
        ("Salt", "Spices & Seasonings"), ("Cumin seeds", "Spices & Seasonings"), ("Bay leaves", "Spices & Seasonings"),
        ("Black beans", "Canned Goods"), ("Chickpeas", "Canned Goods"),
        ("Potato chips", "Snacks"), ("Dark chocolate", "Snacks"), ("Almonds", "Snacks"),
        ("olive oil", "Pantry"), ("Flour", "Pantry"), ("Brown sugar", "Pantry"), ("Sesame seeds", "Pantry"),
        ("Ice cream", "Frozen"), ("Peas", "Frozen"),
    ])
    func filesEverydayFoods(name: String, expected: String) {
        #expect(AisleGuess.category(for: name) == expected)
    }

    /// The processed food is what's named last, or how it's sold, not the fresh ingredient in it.
    @Test(arguments: [
        ("garlic powder", "Spices & Seasonings"), ("chili powder", "Spices & Seasonings"), ("chili flakes", "Spices & Seasonings"),
        ("Red pepper flakes", "Spices & Seasonings"), ("dried basil", "Spices & Seasonings"), ("Ground ginger", "Spices & Seasonings"),
        ("Dried chillies", "Spices & Seasonings"), ("Garlic salt", "Spices & Seasonings"),
        ("tomato sauce", "Condiments & Sauces"), ("tomato paste", "Condiments & Sauces"), ("Soy sauce", "Condiments & Sauces"),
        ("Rice vinegar", "Condiments & Sauces"), ("Sweet chili sauce", "Condiments & Sauces"), ("Pickled onions", "Condiments & Sauces"),
        ("canned tomatoes", "Canned Goods"), ("Tomatoes, canned", "Canned Goods"), ("Tinned tuna", "Canned Goods"),
        ("coconut milk", "Canned Goods"), ("chicken stock", "Canned Goods"), ("Chicken broth", "Canned Goods"),
        ("Cream of mushroom soup", "Canned Goods"), ("Crushed tomatoes", "Canned Goods"),
        ("lemon juice", "Beverages"), ("Orange juice", "Beverages"), ("Ginger ale", "Beverages"),
        ("peanut butter", "Pantry"), ("Baking powder", "Pantry"), ("Chili oil", "Pantry"), ("Sun-dried tomatoes", "Pantry"),
        ("Dried apricots", "Pantry"), ("Almond flour", "Pantry"),
        ("frozen peas", "Frozen"), ("Frozen spinach", "Frozen"), ("Spinach (frozen)", "Frozen"), ("Egg rolls", "Frozen"),
        ("Apple pie", "Bakery"), ("Garlic bread", "Bakery"),
        ("Peanut butter cookies", "Snacks"), ("Milk chocolate", "Snacks"), ("Granola bars", "Snacks"),
        ("Chocolate milk", "Dairy"), ("Garlic butter", "Dairy"),
        ("Tuna in olive oil", "Meat & Seafood"), ("Chicken with lemon", "Meat & Seafood"),
        ("Mac and cheese", "Pasta & Noodles"), ("Rice noodles", "Pasta & Noodles"),
    ])
    func theProcessedFormWinsOverTheFreshIngredient(name: String, expected: String) {
        #expect(AisleGuess.category(for: name) == expected)
    }

    /// Herbs and pepper are sold fresh and as a spice; the name says which.
    @Test(arguments: [
        ("Rosemary", "Spices & Seasonings"), ("Fresh rosemary", "Produce"), ("Fresh thyme", "Produce"), ("Oregano", "Spices & Seasonings"),
        ("Fresh basil", "Produce"), ("Dried parsley", "Spices & Seasonings"), ("Ground coriander", "Spices & Seasonings"),
        ("Pepper", "Spices & Seasonings"), ("Black pepper", "Spices & Seasonings"), ("Salt & pepper", "Spices & Seasonings"),
        ("Freshly ground black pepper", "Spices & Seasonings"), ("Fresh ground pepper", "Spices & Seasonings"),
        ("Cayenne pepper", "Spices & Seasonings"), ("Peppers", "Produce"), ("Red pepper", "Produce"), ("Jalapeño pepper", "Produce"),
    ])
    func tellsTheFreshHerbFromTheSpice(name: String, expected: String) {
        #expect(AisleGuess.category(for: name) == expected)
    }

    /// Whole words only, and nothing for what isn't food: these stay in Other.
    @Test(arguments: [
        "aluminium foil", "Zorblat", "", "Boil-in-bag", "Teapot", "Toilet rolls", "Kitchen roll", "Tea towels",
        "Cat food with chicken", "Washing powder", "Cling wrap",
    ])
    func hasNoOpinionOnNamesItDoesNotKnow(name: String) {
        #expect(AisleGuess.category(for: name) == nil)
    }

    @Test func wholeWordsDoNotMatchInsideOthers() {
        // "egg" in eggplant, "tea" in steak, "oil" in foil, "ice" in rice, "nut" in nutmeg and butternut.
        #expect(AisleGuess.category(for: "Eggplant") == "Produce")
        #expect(AisleGuess.category(for: "Steak") == "Meat & Seafood")
        #expect(AisleGuess.category(for: "Rice") == "Grains & Rice")
        #expect(AisleGuess.category(for: "Nutmeg") == "Spices & Seasonings")
        #expect(AisleGuess.category(for: "Butternut squash") == "Produce")
    }

    @Test func onlyGivesAislesTheAppKnows() {
        #expect(AisleGuess.categories.isSubset(of: ShoppingCategories.all))
        #expect(!AisleGuess.categories.contains("Other"))
    }
}
