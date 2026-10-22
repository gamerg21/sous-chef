import Foundation
import Testing
@testable import SousChef

/// The same real Open Food Facts records (ODbL) the web tests read, from
/// `tests/fixtures/open-food-facts`, so both parsers agree.
private func product(_ code: String, file: String = #filePath) throws -> [String: Any] {
    let url = URL(fileURLWithPath: file)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("tests/fixtures/open-food-facts/\(code).json")
    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    return try #require(json?["product"] as? [String: Any])
}

private func parse(_ code: String) throws -> ProductParser.Parsed {
    try #require(ProductParser.parse(try product(code)))
}

struct ProductFactsTests {
    @Test func countsAMultipackAsCans() throws {
        let parsed = try parse("049000028911")
        let pack = try #require(parsed.facts.packaging)
        #expect(pack.count == 12)
        #expect(pack.container == "can")
        #expect(pack.amount == 144 && pack.unit == "fl oz")
        #expect(pack.eachAmount == 12 && pack.eachUnit == "fl oz")
        #expect(pack.choices == [PackageChoice(quantity: 12, unit: "can"), PackageChoice(quantity: 144, unit: "fl oz")])
        #expect(parsed.facts.nutritionBasis == "100ml")
        #expect(parsed.category == "Beverages")
    }

    @Test func keepsThePrintedSizeAndWorksOutServings() throws {
        let parsed = try parse("016000275287")
        #expect(parsed.facts.packaging == ProductPackaging(text: "18 oz (510 g)", amount: 18, unit: "oz", netQuantity: 510, netUnit: "g", container: "box"))
        #expect(parsed.facts.serving == ProductServing(text: "39g", amount: 39, unit: "g", perPackage: 13))
        #expect(parsed.facts.nutritionPerServing?.energyKcal == 140)
        #expect(parsed.category == "Grains & Rice")
    }

    @Test func trustsThePrintedServingOverAMislabeledUnit() throws {
        let parsed = try parse("041196910759")
        #expect(parsed.facts.serving?.amount == 249)
        #expect(parsed.facts.serving?.unit == "g")
        #expect(parsed.facts.serving?.perPackage == 2)
        #expect(parsed.category == "Canned Goods")
    }

    @Test func ignoresPackagingThatContradictsTheNetContents() throws {
        let parsed = try parse("3017620422003")
        #expect(parsed.facts.packaging == ProductPackaging(text: "400 g e", amount: 400, unit: "g", netQuantity: 400, netUnit: "g"))
        #expect(parsed.facts.storage == "pantry")
        #expect(parsed.category == "Pantry")
    }

    @Test func treatsAPackageSmallerThanAServingAsATypo() throws {
        let parsed = try parse("5000159484695")
        #expect(parsed.facts.packaging == ProductPackaging(text: "1 gram"))
        #expect(parsed.facts.packaging?.choices.isEmpty == true)
        #expect(parsed.facts.storage == "freezer")
    }

    @Test func suggestsTheFreezerAndFridge() throws {
        #expect(try parse("0013800047199").facts.storage == "freezer")
        #expect(try parse("0894700010137").facts.storage == "fridge")
        #expect(ProductParser.storage(conditions: "Store in a cool, dry place. Refrigerate after opening.", categories: nil) == .pantry)
        #expect(ProductParser.storage(conditions: "Keep refrigerated. Once opened, use within 3 days.", categories: nil) == .fridge)
        #expect(ProductParser.storage(conditions: nil, categories: ["en:dairies", "en:uht-milks"]) == .pantry)
    }

    @Test func showsDietaryBadges() throws {
        #expect(ProductParser.badges(try parse("0096619483556").facts) == ["Vegetarian", "Organic", "Gluten-free", "Kosher", "Palm oil free"])
        #expect(ProductParser.badges(try parse("096619756803").facts) == ["Vegan", "Palm oil free"])
    }

    @Test func readsLabelMeasures() {
        #expect(ProductParser.measures("18 oz (510 g)").map(\.unit) == ["oz", "g"])
        #expect(ProductParser.measures("1,5 l").map(\.amount) == [1.5])
        #expect(ProductParser.measures("33 cl").map(\.amount) == [330])
        #expect(ProductParser.packaging(["quantity": "6 x 330 ml", "product_quantity": 1980, "product_quantity_unit": "ml"])?.count == 6)
        #expect(ProductParser.packaging(["quantity": "12 oz", "product_quantity": 355, "product_quantity_unit": "ml"])?.unit == "fl oz")
    }

    @Test func cleansNamesAndWorksOutNutrition() throws {
        #expect(ProductParser.parse(["product_name": "DIET COKE"])?.name == "Diet Coke")
        #expect(ProductParser.parse(["product_name": "Spaghetti - 500 g"])?.name == "Spaghetti")
        let parsed = try #require(ProductParser.parse(["product_name": "Test", "serving_size": "50 g", "serving_quantity": 50,
                                                       "nutriments": ["energy_serving": 418.4, "sodium_serving": 0.2]]))
        #expect(parsed.facts.nutritionPerServing?.energyKcal == 100)
        #expect(parsed.facts.nutrition?.energyKcal == 200)
        #expect(parsed.facts.nutrition?.saltG == 1)
    }

    @Test func reusesHowTheKitchenCountedItLastTime() throws {
        let facts = try parse("049000028911").facts
        #expect(ProductParser.defaults(facts).choice == PackageChoice(quantity: 12, unit: "can"))
        #expect(ProductParser.defaults(facts, previousUnit: "fl oz").choice == PackageChoice(quantity: 144, unit: "fl oz"))
        #expect(ProductParser.defaults(facts).location == .pantry)
    }

    @Test func readsTheServersFacts() throws {
        let data = Data(#"{"brand":"Coca-Cola","packaging":{"count":12,"container":"can","amount":144,"unit":"fl oz"},"serving":{"amount":355,"unit":"ml","perPackage":12},"nutritionPerServing":{"energyKcal":0},"storage":"pantry"}"#.utf8)
        let facts = FoodFacts(json: try JSONDecoder().decode(JSONValue.self, from: data))
        #expect(facts.packaging?.count == 12)
        #expect(facts.serving?.perPackage == 12)
        #expect(facts.nutritionPerServing?.energyKcal == 0)
        #expect(facts.storage == "pantry")
    }

    @Test func infersCategoriesFromTheMostSpecificTag() {
        #expect(ProductParser.category(["en:plant-based-foods-and-beverages", "en:spreads", "en:peanut-butters"]) == "Pantry")
        #expect(ProductParser.category(["en:fruits-based-foods", "en:fruit-juices"]) == "Beverages")
        #expect(ProductParser.category(["en:frozen-foods", "en:frozen-vegetables", "en:peas"]) == "Frozen")
        #expect(ProductParser.category(["en:meats", "en:steaks"]) == "Meat & Seafood")
    }
}
