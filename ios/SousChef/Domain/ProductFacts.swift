import Foundation

/// Package details read from Open Food Facts.
nonisolated struct ProductPackaging: Codable, Hashable {
    /// As printed: "18 oz (510 g)".
    var text: String?
    /// The label's own amount and unit: 18 "oz".
    var amount: Double?
    var unit: String?
    /// Normalized net contents in grams or milliliters.
    var netQuantity: Double?
    var netUnit: String?
    /// Cans, bottles or bars in a multipack, when it holds more than one.
    var count: Int?
    /// What each one is, as a catalog unit label: "can", "bottle", "box", "pkg".
    var container: String?
    /// Size of each one in a multipack, in the label's unit: 12 "fl oz".
    var eachAmount: Double?
    var eachUnit: String?

    /// Ways to count one package, best first: a multipack by its cans,
    /// anything else by the size printed on it, then as one jar or box.
    var choices: [PackageChoice] {
        var result: [PackageChoice] = []
        func add(_ quantity: Double?, _ unit: String?) {
            guard let quantity, quantity > 0, let unit, !result.contains(where: { $0.unit == unit }) else { return }
            result.append(PackageChoice(quantity: quantity, unit: unit))
        }
        let multipack = (count ?? 0) > 1
        if multipack { add(count.map(Double.init), container ?? "each") }
        add(amount, unit)
        if !multipack, let container, container != "each" { add(1, container) }
        return result
    }
}

nonisolated struct ProductServing: Codable, Hashable {
    /// As printed: "1 cup (249 g)".
    var text: String?
    var amount: Double?
    var unit: String?
    /// Servings in the whole package, rounded to the nearest half.
    var perPackage: Double?
}

/// One way to count a package: 12 "can", 144 "fl oz".
nonisolated struct PackageChoice: Hashable {
    var quantity: Double
    var unit: String
}

/// Turns an Open Food Facts product into what a pantry item needs: a clean
/// name, the package size as printed, how many cans or bottles a multipack
/// holds, servings, nutrition per 100 g and per serving, where to keep it,
/// and dietary labels. The data is crowd-sourced and sometimes contradicts
/// itself, so derived values are cross-checked and left out rather than
/// guessed. Ported from `src/lib/food-product.ts`; keep the two in step.
nonisolated enum ProductParser {
    /// Fields requested from Open Food Facts; everything else is left behind.
    static let fields = [
        "code", "product_name", "product_name_en", "generic_name", "generic_name_en", "abbreviated_product_name",
        "brands", "quantity", "product_quantity", "product_quantity_unit",
        "serving_size", "serving_quantity", "serving_quantity_unit", "packagings",
        "categories_tags", "labels_tags", "ingredients_text", "ingredients_text_en", "allergens_tags", "traces_tags",
        "ingredients_analysis_tags", "nutriscore_grade", "nova_group", "ecoscore_grade", "environmental_score_grade",
        "image_front_url", "image_front_small_url", "image_nutrition_url", "image_ingredients_url",
        "nutriments", "nutrition_data_per", "conservation_conditions", "conservation_conditions_en",
    ].joined(separator: ",")

    struct Parsed {
        var name: String
        var category: String?
        var facts: FoodFacts
    }

    struct Measure: Equatable {
        var amount: Double
        var unit: String
        /// Grams or milliliters.
        var base: Double
        var isVolume: Bool
    }

    // MARK: Values

    static func text(_ value: Any?) -> String? {
        guard let value = value as? String else { return nil }
        let joined = value.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return joined.isEmpty ? nil : joined
    }

    static func number(_ value: Any?) -> Double? {
        if value is Bool { return nil }
        if let value = value as? NSNumber { return value.doubleValue.isFinite ? value.doubleValue : nil }
        if let value = value as? String { return Double(value.replacingOccurrences(of: ",", with: ".")) }
        return nil
    }

    static func tags(_ value: Any?) -> [String]? {
        guard let value = value as? [String], !value.isEmpty else { return nil }
        return value
    }

    static func httpsURL(_ value: Any?) -> String? {
        guard let url = text(value), url.hasPrefix("https://") else { return nil }
        return url
    }

    /// Rounds to what a label would print: whole numbers past 100, else up to two decimals.
    static func tidy(_ value: Double) -> Double {
        if abs(value) >= 100 { return value.rounded() }
        if abs(value) >= 10 { return (value * 10).rounded() / 10 }
        return (value * 100).rounded() / 100
    }

    /// Capture groups of every match; missing groups are empty strings.
    static func matches(_ pattern: String, in text: String) -> [[String]] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, range: range).map { match in
            (0..<match.numberOfRanges).map { index in
                Range(match.range(at: index), in: text).map { String(text[$0]) } ?? ""
            }
        }
    }

    static func test(_ pattern: String, _ text: String) -> Bool {
        text.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    // MARK: Measures

    // Label spellings to catalog units and their factor to grams or
    // milliliters. Centiliters and deciliters become milliliters.
    private static let measureUnits: [(pattern: String, unit: String, factor: Double, volume: Bool)] = [
        (#"^(fl\.?\s*oz|fluid\s*ounces?)$"#, "fl oz", 29.5735, true),
        (#"^(oz|ounces?)$"#, "oz", 28.3495, false),
        (#"^(lbs?|pounds?)$"#, "lb", 453.592, false),
        (#"^(kg|kilos?|kilograms?)$"#, "kg", 1000, false),
        (#"^(g|gr|grams?|grammes?)$"#, "g", 1, false),
        (#"^(ml|millilit(er|re)s?)$"#, "ml", 1, true),
        (#"^cl$"#, "cl", 10, true),
        (#"^dl$"#, "dl", 100, true),
        (#"^(l|lit(er|re)s?)$"#, "l", 1000, true),
        (#"^(gal|gallons?)$"#, "gal", 3785.41, true),
        (#"^(qt|quarts?)$"#, "qt", 946.353, true),
        (#"^(pt|pints?)$"#, "pt", 473.176, true),
    ]
    static let measurePattern = #"(\d+(?:[.,]\d+)?)\s*(fl\.?\s*oz|fluid\s*ounces?|ounces?|oz|lbs?|pounds?|kilograms?|kilos?|kg|grammes?|grams?|gr|g|millilit(?:er|re)s?|ml|cl|dl|lit(?:er|re)s?|l|gallons?|gal|quarts?|qt|pints?|pt)\.?(?![a-z])"#

    static func readNumber(_ raw: String) -> Double? {
        // "1,500 g" groups thousands; "1,5 l" is a decimal comma.
        if test(#"^\d{1,3},\d{3}$"#, raw) { return Double(raw.replacingOccurrences(of: ",", with: "")) }
        return Double(raw.replacingOccurrences(of: ",", with: "."))
    }

    static func measure(_ amountText: String, _ unitText: String) -> Measure? {
        guard let amount = readNumber(amountText), amount > 0 else { return nil }
        var spelled = unitText.lowercased().trimmingCharacters(in: .whitespaces)
        if spelled.hasSuffix(".") { spelled.removeLast() }
        guard let match = measureUnits.first(where: { test($0.pattern, spelled) }) else { return nil }
        if match.unit == "cl" || match.unit == "dl" {
            return Measure(amount: tidy(amount * match.factor), unit: "ml", base: amount * match.factor, isVolume: true)
        }
        return Measure(amount: amount, unit: match.unit, base: amount * match.factor, isVolume: match.volume)
    }

    /// Every measure in a label string, in order: "18 oz (510 g)" → 18 oz, 510 g.
    static func measures(_ label: String) -> [Measure] {
        matches(measurePattern, in: label).compactMap { measure($0[1], $0[2]) }
    }

    static func close(_ a: Double, _ b: Double, tolerance: Double = 0.06) -> Bool {
        abs(a - b) <= max(a, b) * tolerance
    }

    // MARK: Containers

    private static let containers: [(pattern: String, unit: String)] = [
        (#"\b(cans?|tins?)\b"#, "can"),
        (#"\bjars?\b"#, "jar"),
        (#"\bbottles?\b"#, "bottle"),
        (#"\b(box(es)?|cartons?|bricks?)\b"#, "box"),
        (#"\b(bags?|sachets?|pouch(es)?)\b"#, "bag"),
        (#"\b(packs?|packets?|packages?|pkgs?|tubs?|pots?|trays?|containers?)\b"#, "pkg"),
    ]
    // Parts of a package rather than the package itself.
    private static let components = #"\b(caps?|lids?|labels?|films?|seals?|wrappers?|sleeves?|straws?)\b"#

    static func words(_ tag: String) -> String {
        tag.lowercased()
            .replacingOccurrences(of: #"^[a-z]{2}:"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"[-_]"#, with: " ", options: .regularExpression)
    }

    static func container(_ word: String?) -> String? {
        guard let word else { return nil }
        let spelled = words(word)
        if test(components, spelled) { return nil }
        return containers.first { test($0.pattern, spelled) }?.unit
    }

    // MARK: Package and serving

    static func packaging(_ product: [String: Any]) -> ProductPackaging? {
        let label = text(product["quantity"])
        let netRaw = number(product["product_quantity"])
        let netUnitRaw = text(product["product_quantity_unit"])?.lowercased()
        let found = label.map(measures) ?? []
        let netUnit: String? = netUnitRaw == "ml" || netUnitRaw == "g" ? netUnitRaw : found.first.map { $0.isVolume ? "ml" : "g" }
        let net = netRaw.flatMap { $0 > 0 && $0 < 1_000_000 ? $0 : nil }

        // A US drink's "12 oz" means fluid ounces.
        func fix(_ measure: Measure) -> Measure {
            guard measure.unit == "oz", netUnit == "ml" else { return measure }
            return Measure(amount: measure.amount, unit: "fl oz", base: measure.amount * 29.5735, isVolume: true)
        }
        let printed = found.map(fix)

        var count: Int?
        var each: Measure?
        var containerUnit: String?
        if let label {
            if let before = matches(#"(\d+)\s*[x×*]\s*"# + measurePattern, in: label).first,
               let measure = measure(before[2], before[3]), let n = Int(before[1]), n >= 2 {
                count = n
                each = fix(measure)
            } else if let after = matches(measurePattern + #"\s*[x×*]\s*(\d+)\b"#, in: label).first,
                      let measure = measure(after[1], after[2]), let n = Int(after[3]), n >= 2 {
                count = n
                each = fix(measure)
            }
            if count == nil, let counted = matches(#"(?:^|\s)(\d+)\s*(?:-\s*)?(pack|pk|ct|count|[a-z]+s)\b"#, in: label).first,
               let n = Int(counted[1]), n >= 2, measure("1", counted[2]) == nil {
                count = n
                containerUnit = container(counted[2])
            }
        }

        // The label's own amount, checked against the normalized net contents.
        var chosen: Measure?
        if let count, let each {
            chosen = Measure(amount: tidy(Double(count) * each.amount), unit: each.unit, base: Double(count) * each.base, isVolume: each.isVolume)
        } else {
            chosen = printed.first { net == nil || close($0.base, net!) } ?? (net == nil ? printed.first : nil)
        }
        if chosen == nil, let net, let netUnit {
            let large = net >= 1000
            let unit = netUnit == "g" ? (large ? "kg" : "g") : (large ? "l" : "ml")
            chosen = Measure(amount: tidy(large ? net / 1000 : net), unit: unit, base: net, isVolume: netUnit == "ml")
        }
        let netQuantity = net ?? chosen?.base

        // A serving of "1 can (354.9 mL)" that divides the package evenly gives the count.
        let servingText = text(product["serving_size"])
        let servingAmount = number(product["serving_quantity"])
        let servingWord = servingText.flatMap { matches(#"^\s*1\s+([a-z]+)"#, in: $0).first?[1] }
        if count == nil, let servingContainer = container(servingWord), let netQuantity, let servingAmount, servingAmount > 0 {
            let ratio = netQuantity / servingAmount
            let whole = ratio.rounded()
            if whole >= 1, whole <= 100, close(ratio, whole, tolerance: 0.04) {
                containerUnit = servingContainer
                if whole >= 2 { count = Int(whole) }
            }
        }

        // Packaging records: trusted only when their sizes add up to the net contents.
        for entry in product["packagings"] as? [[String: Any]] ?? [] {
            guard let shape = container(text(entry["shape"])) else { continue }
            let units = number(entry["number_of_units"])
            let perMeasure = text(entry["quantity_per_unit"]).flatMap { measures($0).first }
            if let perMeasure, let netQuantity, !close((units ?? 1) * perMeasure.base, netQuantity, tolerance: 0.1) { continue }
            if containerUnit == nil { containerUnit = shape }
            if count == nil, let units, units >= 2, let perMeasure {
                count = Int(units)
                each = fix(perMeasure)
            }
            break
        }

        guard chosen != nil || count != nil || label != nil else { return nil }
        var result = ProductPackaging(text: label, amount: chosen.map { tidy($0.amount) }, unit: chosen?.unit,
                                      netQuantity: netQuantity.map(tidy), netUnit: netQuantity == nil ? nil : netUnit ?? ((chosen?.isVolume ?? false) ? "ml" : "g"),
                                      count: count, container: containerUnit ?? (count == nil ? nil : "each"))
        if let count, let chosen {
            result.eachAmount = tidy(chosen.amount / Double(count))
            result.eachUnit = chosen.unit
        }
        return result
    }

    static func serving(_ product: [String: Any], packaging: ProductPackaging?) -> ProductServing? {
        let label = text(product["serving_size"])
        let quantity = number(product["serving_quantity"])
        let unitRaw = text(product["serving_quantity_unit"])?.lowercased()
        // The printed metric amount wins when the fields disagree ("1 cup (249 g)" saved as ml).
        let printed = label.flatMap { measures($0).first { $0.unit == "g" || $0.unit == "ml" } }
        var amount = printed?.amount ?? quantity
        var unit: String? = printed?.unit ?? (unitRaw == "ml" ? "ml" : quantity == nil ? nil : "g")
        if printed == nil, quantity == nil, let other = label.flatMap({ measures($0).first }) {
            amount = tidy(other.base)
            unit = other.isVolume ? "ml" : "g"
        }
        if (amount ?? 0) <= 0 { amount = nil; unit = nil }
        guard label != nil || amount != nil else { return nil }
        var perPackage: Double?
        if let amount, let net = packaging?.netQuantity {
            let ratio = net / amount
            if ratio >= 0.75, ratio <= 1000 { perPackage = max(1, (ratio * 2).rounded() / 2) }
        }
        return ProductServing(text: label, amount: amount.map(tidy), unit: unit, perPackage: perPackage)
    }

    // MARK: Nutrition

    static func nutrients(_ source: [String: Any], suffix: String) -> [String: Double] {
        func read(_ key: String) -> Double? { number(source[key + suffix]).flatMap { $0 >= 0 ? $0 : nil } }
        var result: [String: Double] = [:]
        let kj = read("energy-kj") ?? read("energy")
        result["energyKcal"] = read("energy-kcal") ?? kj.map { $0 / 4.184 }
        result["proteinG"] = read("proteins")
        result["carbsG"] = read("carbohydrates")
        result["fatG"] = read("fat")
        result["sugarsG"] = read("sugars")
        result["fiberG"] = read("fiber")
        result["saltG"] = read("salt") ?? read("sodium").map { $0 * 2.5 }
        return result
    }

    static func nutrition(_ values: [String: Double]) -> Nutrition? {
        let rounded = values.mapValues { ($0 * 10).rounded() / 10 }
        let nutrition = Nutrition(json: rounded)
        return nutrition.isEmpty ? nil : nutrition
    }

    // MARK: Storage

    private static let freezerText = #"\b(keep|store|stored|kept)\s+frozen\b|-\s?18\s?°|\bsurgel|\bcongel"#
    private static let fridgeText = #"\b(keep|store|stored|kept)\s+(refrigerated|chilled|cold|in\s+(a|the|your)\s+(fridge|refrigerator))\b|\brefrigerate\b|\bbetween\s+[0-4]\s?°?\s?c?\s+and\s+[4-8]\s?°|\b[0-4]\s?°?c?\s?(-|to|and)\s?[4-8]\s?°\s?c|\bconserver au r[ée]frig|\bau frais entre"#
    private static let notFridgeText = #"\b(do not|don't|no need to|ne pas)\s+(refrigerat|mettre au r[ée]frig)"#
    private static let pantryText = #"\b(cool,?\s*(and\s+)?dry|dry\s+place|room temperature|ambient|endroit (frais et )?sec|à l'abri de la chaleur)\b"#
    private static let fridgeTags = #"\b(yogh?urts?|cheeses?|milks?|butters?|creams?|kefirs?|eggs|meats?|poultr\w*|fish(es)?|seafoods?|sausages?|hams?|tofus?|hummus|refrigerated|chilled|fresh (meats?|pastas?|cheeses?|creams?|juices?|doughs?))\b"#
    private static let shelfTags = #"\b(canned|tinned|dried|dry|uht|long life|shelf stable|powder\w*|instant|condensed|evaporated|peanut butters?|nut butters?|jerky)\b"#

    /// Where the package should go, from its storage instructions and categories.
    static func storage(conditions: String?, categories: [String]?) -> StorageLocation? {
        let lower = conditions?.lowercased() ?? ""
        let tagWords = (categories ?? []).map(words)
        if test(freezerText, lower) || tagWords.contains(where: { test(#"\bfrozen\b|\bsurgel|\bcongel"#, $0) }) { return .freezer }
        // "Refrigerate after opening" is about the opened package, not this one.
        let unopened = lower.split(whereSeparator: { ".;,\n".contains($0) })
            .filter { !test(#"\bopen|\bouvert|\bouverture"#, String($0)) }
            .joined(separator: ". ")
        if test(notFridgeText, lower) { return .pantry }
        if test(fridgeText, unopened) { return .fridge }
        if test(pantryText, unopened) { return .pantry }
        if tagWords.isEmpty { return nil }
        if tagWords.contains(where: { test(shelfTags, $0) }) { return .pantry }
        if tagWords.contains(where: { test(fridgeTags, $0) }) { return .fridge }
        return .pantry
    }

    // MARK: Category

    // Checked against each category tag, most specific first. Pantry staples
    // come before dairy so "peanut butters" isn't read as butter.
    private static let categoryRules: [(pattern: String, category: String)] = [
        (#"\b(canned|tinned)\b"#, "Canned Goods"),
        (#"\b(spreads?|peanut butters?|nut butters?|honeys?|jams?|marmalades?|syrups?|oils?|flours?|sugars?|baking|cocoa powders?)\b"#, "Pantry"),
        (#"\b(dairies|dairy|milks?|cheeses?|yogh?urts?|butters?|creams?|kefirs?|eggs)\b"#, "Dairy"),
        (#"\b(meats?|poultr\w*|chickens?|beef|pork|hams?|sausages?|bacon|fish(es)?|seafoods?|shrimps?|prawns?|salmons?|tunas?|turkeys?)\b"#, "Meat & Seafood"),
        (#"\b(breads?|bakery|baked goods|pastr\w*|buns?|bagels?|tortillas?|croissants?|muffins?)\b"#, "Bakery"),
        (#"\b(beverages?|drinks?|waters?|juices?|sodas?|colas?|coffees?|teas?|lemonades?|smoothies?)\b"#, "Beverages"),
        (#"\b(pastas?|noodles?|spaghetti|macaroni|penne|fusilli|lasagn\w*|ramen)\b"#, "Pasta & Noodles"),
        (#"\b(rices?|grains?|cereals?|oats?|oatmeals?|quinoa|couscous|mueslis?|granolas?)\b"#, "Grains & Rice"),
        (#"\b(spices?|seasonings?|herbs?|salts?)\b"#, "Spices & Seasonings"),
        (#"\b(condiments?|sauces?|ketchups?|mustards?|mayonnaises?|dressings?|vinegars?|salsas?|pickles?)\b"#, "Condiments & Sauces"),
        (#"\b(snacks?|chips|crisps|crackers?|cand(y|ies)|chocolates?|biscuits?|cookies?|bars|confectioner\w*|popcorn|nuts)\b"#, "Snacks"),
        (#"\b(fruits?|vegetables?|produce|salads?|legumes?|beans?|potatoes?)\b"#, "Produce"),
    ]
    // Umbrella tags that say little about the aisle ("plant-based foods and beverages").
    private static let umbrellaTags = #"^(plant based foods( and beverages)?|beverages and beverages preparations|foods|groceries|breakfasts|meals|sweet snacks|salty snacks)$"#

    /// Maps Open Food Facts category tags onto the app's category options.
    static func category(_ categories: [String]?) -> String? {
        guard let categories, !categories.isEmpty else { return nil }
        let tagWords = categories.map(words)
        if tagWords.contains(where: { test(#"\bfrozen\b"#, $0) }) { return "Frozen" }
        for tag in tagWords.reversed() where !test(umbrellaTags, tag) {
            if let rule = categoryRules.first(where: { test($0.pattern, tag) }) { return rule.category }
        }
        for tag in tagWords {
            if let rule = categoryRules.first(where: { test($0.pattern, tag) }) { return rule.category }
        }
        return "Other"
    }

    // MARK: Name and badges

    static func cleanName(_ raw: String) -> String {
        // "Spaghetti 500 g": the size is shown with the package.
        var name = raw.replacingOccurrences(of: #"\s*[-–,]?\s*"# + measurePattern + #"\s*$"#, with: "", options: [.regularExpression, .caseInsensitive])
            .trimmingCharacters(in: .whitespaces)
        if name.isEmpty { name = raw }
        // Packages often print names in capitals ("DIET COKE").
        if name.count > 3, name == name.uppercased(), name.contains(where: \.isLetter) { name = name.capitalized }
        return name
    }

    private static let badgeLabels: [(keys: [String], label: String)] = [
        (["en:organic", "en:eu-organic", "en:usda-organic", "en:bio"], "Organic"),
        (["en:gluten-free", "en:no-gluten"], "Gluten-free"),
        (["en:kosher"], "Kosher"),
        (["en:halal"], "Halal"),
        (["en:fair-trade", "en:fairtrade-international", "en:fair-trade-usa"], "Fair trade"),
        (["en:no-added-sugar"], "No added sugar"),
        (["en:no-gmos", "en:non-gmo-project", "en:non-gmo-project-verified"], "Non-GMO"),
    ]

    /// Short dietary labels worth showing: vegan, organic, gluten-free and the like.
    static func badges(_ facts: FoodFacts) -> [String] {
        let analysis = Set(facts.ingredientsAnalysisTags ?? [])
        let labels = Set(facts.labelsTags ?? [])
        var result: [String] = []
        if analysis.contains("en:vegan") || labels.contains("en:vegan") { result.append("Vegan") }
        else if analysis.contains("en:vegetarian") || labels.contains("en:vegetarian") { result.append("Vegetarian") }
        for badge in badgeLabels where badge.keys.contains(where: labels.contains) { result.append(badge.label) }
        if analysis.contains("en:palm-oil-free") { result.append("Palm oil free") }
        return result
    }

    // MARK: Whole product

    static func parse(_ product: [String: Any]) -> Parsed? {
        let rawName = ["product_name", "product_name_en", "generic_name_en", "generic_name", "abbreviated_product_name"]
            .lazy.compactMap { text(product[$0]) }.first
        guard let rawName else { return nil }
        let categoriesTags = tags(product["categories_tags"])
        var pack = packaging(product)
        var portion = serving(product, packaging: pack)
        // A package smaller than one serving ("1 g" of ice cream bars) is a typo.
        if let net = pack?.netQuantity, let amount = portion?.amount, amount > net * 1.34 {
            pack = ProductPackaging(text: pack?.text, count: pack?.count, container: pack?.container)
            portion = serving(product, packaging: pack)
        }
        let nutriments = product["nutriments"] as? [String: Any] ?? [:]
        var per100 = nutrients(nutriments, suffix: "_100g")
        var perServing = nutrients(nutriments, suffix: "_serving")
        if let amount = portion?.amount {
            if per100.isEmpty, !perServing.isEmpty { per100 = perServing.mapValues { $0 * 100 / amount } }
            if perServing.isEmpty, !per100.isEmpty { perServing = per100.mapValues { $0 * amount / 100 } }
        }
        let conditions = text(product["conservation_conditions_en"]) ?? text(product["conservation_conditions"])
        let perMl = text(product["nutrition_data_per"]) == "100ml" || pack?.netUnit == "ml"
        // "unknown" and "not-applicable" grades say nothing.
        func grade(_ value: String?) -> String? { value.flatMap { test(#"^[a-e]$"#, $0) ? $0.lowercased() : nil } }
        var facts = FoodFacts(brand: text(product["brands"]), categoriesTags: categoriesTags,
                              ingredientsText: text(product["ingredients_text_en"]) ?? text(product["ingredients_text"]),
                              allergensTags: tags(product["allergens_tags"]),
                              nutriscoreGrade: grade(text(product["nutriscore_grade"])),
                              novaGroup: number(product["nova_group"]).map { Int($0) },
                              ecoscoreGrade: grade(text(product["ecoscore_grade"]) ?? text(product["environmental_score_grade"])),
                              imageFrontUrl: httpsURL(product["image_front_url"]),
                              nutrition: nutrition(per100))
        facts.tracesTags = tags(product["traces_tags"])
        facts.labelsTags = tags(product["labels_tags"])
        facts.ingredientsAnalysisTags = tags(product["ingredients_analysis_tags"])
        facts.imageFrontSmallUrl = httpsURL(product["image_front_small_url"])
        facts.imageNutritionUrl = httpsURL(product["image_nutrition_url"])
        facts.imageIngredientsUrl = httpsURL(product["image_ingredients_url"])
        facts.genericName = text(product["generic_name_en"]) ?? text(product["generic_name"])
        facts.packaging = pack
        facts.serving = portion
        facts.nutritionPerServing = nutrition(perServing)
        facts.nutritionBasis = per100.isEmpty ? nil : perMl ? "100ml" : "100g"
        facts.storage = storage(conditions: conditions, categories: categoriesTags)?.rawValue
        facts.storageText = conditions
        return Parsed(name: cleanName(rawName), category: category(categoriesTags), facts: facts)
    }

    /// What a scan fills in for one package: the way the household counted
    /// this product last time when that's still a choice, else the best choice.
    static func defaults(_ facts: FoodFacts?, previousUnit: String? = nil) -> (choice: PackageChoice?, location: StorageLocation?) {
        let choices = facts?.packaging?.choices ?? []
        let choice = choices.first { $0.unit == previousUnit } ?? choices.first
        return (choice, facts?.storage.flatMap(StorageLocation.init(rawValue:)))
    }
}
