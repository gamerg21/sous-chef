import Foundation

/// The store aisle a food is probably in, from its name alone: enough to
/// group the shopping list until Apple Intelligence categorizes it.
nonisolated enum AisleGuess {
    /// One of `ShoppingCategories.all`, or nil when the name says nothing (shown as "Other").
    static func category(for name: String) -> String? {
        let words = FoodWords.words(name)
        // On its own it's the grinder; "peppers" and "red pepper" are the vegetable.
        if words == ["pepper"] { return "Spices & Seasonings" }
        let stems = words.map(FoodWords.stem)
        if let sold = packaging.first(where: { lastEnd(of: $0.parts, in: stems) != nil }) { return sold.category }
        // "Tuna in olive oil", "beans in tomato sauce": the food comes before these.
        var head: Term?
        if let cut = words.firstIndex(where: prepositions.contains), cut > 0 { head = best(Array(stems[..<cut])) }
        guard let term = head ?? best(stems) else { return nil }
        let isDried = stems.contains(where: dried.contains)
        if herbs.contains(term.parts) {
            if isDried { return "Spices & Seasonings" }
            if stems.contains("fresh") { return "Produce" }
        }
        // Dried fruit and sun-dried tomatoes are shelved with baking, not with the fresh ones.
        if isDried, term.category == "Produce" { return "Pantry" }
        return term.category
    }

    /// Every aisle the guess can give, to check against `ShoppingCategories.all`.
    static var categories: Set<String> { Set((packaging + foods).compactMap { $0.category }) }

    // MARK: The list

    /// Sold fresh and as a jar of spice. These are the fresh one unless the
    /// name says dried or ground...
    private static let freshHerbs = """
        garlic, garlic clove, ginger, onion, chili, chilli, chile, pepper, jalapeno, serrano, habanero, herb, basil,
        cilantro, coriander, parsley, mint, dill, chive, lemongrass
        """
    /// ...and these are the jar unless it says fresh.
    private static let driedHerbs = "oregano, thyme, rosemary, sage, tarragon, turmeric, bay leaf, bay leaves"

    /// Whole words and phrases, singular. Where a row sits doesn't matter:
    /// the last food named wins (see `best`), which is how "garlic powder",
    /// "tomato sauce" and "lemon juice" leave Produce without a rule each.
    private static let aisles: [(category: String?, foods: String)] = [
        ("Produce", """
            apple, banana, orange, clementine, mandarin, lemon, lime, grapefruit, grape, berry, strawberry, blueberry,
            raspberry, blackberry, cranberry, cherry, peach, pear, plum, nectarine, apricot, mango, pineapple, melon,
            watermelon, kiwi, avocado, fruit, tomato, potato, carrot, celery, cucumber, lettuce, romaine, spinach, kale,
            arugula, rocket, cabbage, bok choy, broccoli, cauliflower, zucchini, courgette, eggplant, aubergine, squash,
            pumpkin, mushroom, corn, sweetcorn, asparagus, green bean, snap pea, snow pea, beet, beetroot, radish, turnip, parsnip,
            fennel, leek, shallot, scallion, sprout, salad, vegetable
            """),
        ("Produce", freshHerbs),
        ("Dairy", """
            milk, buttermilk, cream, creamer, half and half, creme fraiche, butter, margarine, cheese, cheddar, mozzarella,
            parmesan, feta, ricotta, mascarpone, halloumi, paneer, brie, yogurt, yoghurt, kefir, egg
            """),
        ("Meat & Seafood", """
            chicken, beef, pork, lamb, turkey, duck, veal, bacon, sausage, ham, steak, mince, meat, meatball, burger,
            hamburger, hot dog, salami, pepperoni, chorizo, prosciutto, fish, fish cake, salmon, tuna, cod, tilapia, trout,
            shrimp, prawn, crab, lobster, scallop, mussel, clam, seafood
            """),
        ("Frozen", """
            ice cream, ice, gelato, sorbet, popsicle, pea, fries, pizza, nugget, fish finger, fish stick, waffle, dumpling,
            edamame, hash brown, egg roll, spring roll
            """),
        ("Bakery", """
            bread, loaf, baguette, sourdough, ciabatta, focaccia, brioche, bun, roll, bagel, tortilla, wrap, pita, pitta,
            naan, flatbread, croissant, muffin, crumpet, scone, pastry, cake, cupcake, pie, donut, doughnut, dough
            """),
        ("Beverages", """
            juice, soda, cola, coke, lemonade, coffee, coffee bean, espresso, tea, hot chocolate, water, seltzer, wine,
            beer, ale, cider, kombucha, smoothie, drink
            """),
        ("Canned Goods", """
            bean, chickpea, chick pea, black eyed pea, soup, broth, stock, bouillon, puree, passata, crushed tomato,
            diced tomato, coconut milk, coconut cream, condensed milk, evaporated milk, sardine, anchovy
            """),
        ("Grains & Rice", """
            rice, oat, oatmeal, porridge, quinoa, couscous, bulgur, barley, farro, polenta, cornmeal, grits, grain, cereal,
            granola, muesli, cornflake, corn flake, bran flake, lentil, split pea
            """),
        ("Pasta & Noodles", """
            pasta, noodle, spaghetti, macaroni, macaroni and cheese, mac and cheese, penne, fusilli, rigatoni, linguine,
            fettuccine, tagliatelle, lasagna, lasagne, orzo, gnocchi, ravioli, tortellini, vermicelli, ramen, udon, soba
            """),
        ("Spices & Seasonings", """
            salt, salt and pepper, black pepper, white pepper, cayenne pepper, lemon pepper, crushed red pepper, peppercorn,
            spice, seasoning, rub, powder, flake, cumin, paprika, cinnamon, nutmeg, cayenne, clove, cardamom, allspice,
            saffron, anise, curry, masala, cumin seed, mustard seed, fennel seed, coriander seed, caraway seed, celery seed
            """),
        ("Spices & Seasonings", driedHerbs),
        ("Condiments & Sauces", """
            sauce, ketchup, mustard, mayo, mayonnaise, aioli, vinegar, dressing, vinaigrette, marinade, gravy, salsa, pesto,
            paste, relish, chutney, pickle, olive, caper, sriracha, tabasco, miso, horseradish, tahini
            """),
        ("Snacks", """
            chip, crisp, cracker, cookie, biscuit, pretzel, popcorn, chocolate, candy, snack, bar, rice cake, jerky, nut,
            peanut, almond, walnut, pecan, cashew, pistachio, hazelnut
            """),
        // Baking and staples, as `ProductParser.category` files them.
        ("Pantry", """
            flour, sugar, sweetener, honey, syrup, molasses, jam, jelly, marmalade, spread, peanut butter, almond butter,
            cashew butter, nut butter, oil, shortening, lard, ghee, baking soda, bicarbonate of soda, baking powder,
            cocoa powder, milk powder, cream of tartar, yeast, cornstarch, cornflour, starch, cocoa, vanilla, vanilla bean,
            extract, gelatin, chocolate chip, breadcrumb, bread crumb, panko, cake mix, pancake mix, coconut, raisin, seed,
            sesame, chia
            """),
        // Not groceries, so the food word inside them doesn't count: a toilet roll isn't bread.
        (nil, """
            food, soap, shampoo, detergent, towel, toilet roll, kitchen roll, plastic wrap, cling wrap, washing powder,
            baby powder, protein powder
            """),
    ]

    /// How it's sold settles the aisle wherever the word appears: "frozen
    /// peas", "tomatoes, canned". Frozen first, so frozen wins over the rest.
    private static let packaging: [Term] = terms([
        ("Frozen", "frozen"),
        ("Canned Goods", "canned, tinned, can of, tin of"),
        ("Condiments & Sauces", "pickled"),
    ])

    private static let foods: [Term] = terms(aisles)
    private static let herbs: Set<[String]> = Set(terms([(nil, freshHerbs), (nil, driedHerbs)]).map { $0.parts })
    private static let dried: Set<String> = Set(["dried", "ground", "powdered"].map(FoodWords.stem))
    private static let prepositions: Set<String> = ["with", "in", "for", "from"]

    // MARK: Matching

    /// A word or phrase as `FoodWords` stems, so "Tomatoes" and "jalapeño" match "tomato" and "jalapeno".
    private typealias Term = (parts: [String], category: String?)

    private static func terms(_ rows: [(category: String?, foods: String)]) -> [Term] {
        var terms: [Term] = []
        for row in rows {
            for food in row.foods.split(whereSeparator: { $0 == "," || $0.isNewline }) {
                let parts = FoodWords.stems(String(food))
                if !parts.isEmpty { terms.append((parts: parts, category: row.category)) }
            }
        }
        return terms
    }

    /// The index just past the last place the term appears as whole words.
    private static func lastEnd(of parts: [String], in stems: [String]) -> Int? {
        guard !parts.isEmpty, stems.count >= parts.count else { return nil }
        for start in stride(from: stems.count - parts.count, through: 0, by: -1)
        where Array(stems[start..<(start + parts.count)]) == parts {
            return start + parts.count
        }
        return nil
    }

    /// English puts the food last ("tomato sauce" is sauce, "egg noodles"
    /// are noodles), so the term ending latest wins; of two ending together
    /// the longer ("peanut butter" over "butter"). `StoragePlacement` reads
    /// names the same way.
    private static func best(_ stems: [String]) -> Term? {
        var best: (term: Term, end: Int)?
        for term in foods {
            guard let end = lastEnd(of: term.parts, in: stems) else { continue }
            if let current = best {
                guard end > current.end || (end == current.end && term.parts.count > current.term.parts.count) else { continue }
            }
            best = (term, end)
        }
        return best?.term
    }
}
