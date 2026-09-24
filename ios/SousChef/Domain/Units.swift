import Foundation

/// The unit catalog, ported from the server seed in `src/server/kitchen/units.ts`
/// so offline cooking plans convert amounts exactly as the web app does.
struct KitchenUnit: Hashable, Identifiable {
    enum Kind: String { case count, volume, mass, temperature, time, package, qualitative }
    enum System: String { case us, metric, neutral }

    let slug: String
    let name: String
    let abbr: String?
    let kind: Kind
    let system: System
    /// Factor to the base unit of its kind (ml for volume, g for mass, s for time).
    let factor: Double?
    let isCommon: Bool
    let aliases: [String]

    var id: String { slug }
    /// What we store on items: the abbreviation when there is one.
    var label: String { abbr ?? name }
    var labels: [String] { [name, slug, abbr ?? ""] + aliases }
}

enum Units {
    static let catalog: [KitchenUnit] = [
        .init(slug: "each", name: "each", abbr: "each", kind: .count, system: .neutral, factor: nil, isCommon: true, aliases: ["ea", "count", "piece", "pieces", "pc", "unit"]),
        .init(slug: "clove", name: "clove", abbr: nil, kind: .count, system: .neutral, factor: nil, isCommon: true, aliases: ["cloves"]),
        .init(slug: "slice", name: "slice", abbr: nil, kind: .count, system: .neutral, factor: nil, isCommon: true, aliases: ["slices"]),
        .init(slug: "bunch", name: "bunch", abbr: nil, kind: .count, system: .neutral, factor: nil, isCommon: false, aliases: ["bunches"]),
        .init(slug: "sprig", name: "sprig", abbr: nil, kind: .count, system: .neutral, factor: nil, isCommon: false, aliases: ["sprigs"]),
        .init(slug: "stick", name: "stick", abbr: nil, kind: .count, system: .neutral, factor: nil, isCommon: false, aliases: ["sticks"]),
        .init(slug: "teaspoon", name: "teaspoon", abbr: "tsp", kind: .volume, system: .us, factor: 4.92892, isCommon: true, aliases: ["tsp.", "ts", "teaspoons", "tea spoon"]),
        .init(slug: "tablespoon", name: "tablespoon", abbr: "tbsp", kind: .volume, system: .us, factor: 14.7868, isCommon: true, aliases: ["tbsp.", "T", "tablespoons", "tbl"]),
        .init(slug: "cup", name: "cup", abbr: "cup", kind: .volume, system: .us, factor: 236.588, isCommon: true, aliases: ["c", "cups"]),
        .init(slug: "fluid-ounce", name: "fluid ounce", abbr: "fl oz", kind: .volume, system: .us, factor: 29.5735, isCommon: false, aliases: ["floz", "fl", "fluid ounces"]),
        .init(slug: "pint", name: "pint", abbr: "pt", kind: .volume, system: .us, factor: 473.176, isCommon: false, aliases: ["pints"]),
        .init(slug: "quart", name: "quart", abbr: "qt", kind: .volume, system: .us, factor: 946.353, isCommon: false, aliases: ["quarts"]),
        .init(slug: "gallon", name: "gallon", abbr: "gal", kind: .volume, system: .us, factor: 3785.41, isCommon: false, aliases: ["gallons"]),
        .init(slug: "milliliter", name: "milliliter", abbr: "ml", kind: .volume, system: .metric, factor: 1, isCommon: true, aliases: ["mL", "millilitre", "milliliters", "millilitres"]),
        .init(slug: "liter", name: "liter", abbr: "l", kind: .volume, system: .metric, factor: 1000, isCommon: true, aliases: ["L", "litre", "liters", "litres"]),
        .init(slug: "gram", name: "gram", abbr: "g", kind: .mass, system: .metric, factor: 1, isCommon: true, aliases: ["grams", "gr"]),
        .init(slug: "kilogram", name: "kilogram", abbr: "kg", kind: .mass, system: .metric, factor: 1000, isCommon: true, aliases: ["kilograms", "kilo", "kilos"]),
        .init(slug: "ounce", name: "ounce", abbr: "oz", kind: .mass, system: .us, factor: 28.3495, isCommon: true, aliases: ["oz.", "ounces"]),
        .init(slug: "pound", name: "pound", abbr: "lb", kind: .mass, system: .us, factor: 453.592, isCommon: true, aliases: ["lbs", "#", "pounds", "lb."]),
        .init(slug: "fahrenheit", name: "Fahrenheit", abbr: "°F", kind: .temperature, system: .us, factor: nil, isCommon: false, aliases: ["F", "degrees F", "deg F"]),
        .init(slug: "celsius", name: "Celsius", abbr: "°C", kind: .temperature, system: .metric, factor: nil, isCommon: false, aliases: ["C", "degrees C", "deg C"]),
        .init(slug: "second", name: "second", abbr: "sec", kind: .time, system: .neutral, factor: 1, isCommon: false, aliases: ["seconds", "s"]),
        .init(slug: "minute", name: "minute", abbr: "min", kind: .time, system: .neutral, factor: 60, isCommon: false, aliases: ["minutes", "mins"]),
        .init(slug: "hour", name: "hour", abbr: "hr", kind: .time, system: .neutral, factor: 3600, isCommon: false, aliases: ["hours", "hrs", "h"]),
        .init(slug: "can", name: "can", abbr: nil, kind: .package, system: .neutral, factor: nil, isCommon: true, aliases: ["cans"]),
        .init(slug: "jar", name: "jar", abbr: nil, kind: .package, system: .neutral, factor: nil, isCommon: false, aliases: ["jars"]),
        .init(slug: "bottle", name: "bottle", abbr: nil, kind: .package, system: .neutral, factor: nil, isCommon: false, aliases: ["bottles"]),
        .init(slug: "box", name: "box", abbr: nil, kind: .package, system: .neutral, factor: nil, isCommon: false, aliases: ["boxes"]),
        .init(slug: "bag", name: "bag", abbr: nil, kind: .package, system: .neutral, factor: nil, isCommon: false, aliases: ["bags"]),
        .init(slug: "package", name: "package", abbr: "pkg", kind: .package, system: .neutral, factor: nil, isCommon: false, aliases: ["packages", "pack", "packet"]),
        .init(slug: "to-taste", name: "to taste", abbr: nil, kind: .qualitative, system: .neutral, factor: nil, isCommon: true, aliases: ["taste"]),
        .init(slug: "as-needed", name: "as needed", abbr: nil, kind: .qualitative, system: .neutral, factor: nil, isCommon: false, aliases: ["needed"]),
        .init(slug: "for-garnish", name: "for garnish", abbr: nil, kind: .qualitative, system: .neutral, factor: nil, isCommon: false, aliases: ["garnish"]),
        .init(slug: "optional", name: "optional", abbr: nil, kind: .qualitative, system: .neutral, factor: nil, isCommon: false, aliases: []),
    ]

    private static let index: [String: KitchenUnit] = {
        var map: [String: KitchenUnit] = [:]
        for unit in catalog {
            for label in unit.labels where !label.isEmpty { map[normalizeName(label)] = unit }
        }
        return map
    }()

    static func find(_ label: String?) -> KitchenUnit? { index[normalizeName(label)] }

    /// Converts between compatible units; nil when the kinds differ or a
    /// factor is unknown. Identical labels always convert 1:1.
    static func convert(_ quantity: Double, from: String?, to: String?) -> Double? {
        let a = normalizeName(from), b = normalizeName(to)
        if a == b { return quantity }
        guard let source = index[a], let target = index[b], source.kind == target.kind else { return nil }
        if source == target { return quantity }
        guard let sf = source.factor, let tf = target.factor else { return nil }
        return quantity * sf / tf
    }

    static var pickerGroups: [(title: String, units: [KitchenUnit])] {
        let kinds: [(KitchenUnit.Kind, String)] = [(.count, "Count"), (.mass, "Weight"), (.volume, "Volume"), (.package, "Packages"), (.qualitative, "Other")]
        return kinds.map { kind, title in (title, catalog.filter { $0.kind == kind }) }
    }

    static func format(_ quantity: Double?) -> String {
        guard let quantity else { return "" }
        let fractions: [(Double, String)] = [(0.25, "¼"), (0.5, "½"), (0.75, "¾"), (1.0 / 3, "⅓"), (2.0 / 3, "⅔"), (0.125, "⅛")]
        let whole = floor(quantity)
        let rest = quantity - whole
        if rest > 0.001, let match = fractions.first(where: { abs($0.0 - rest) < 0.01 }) {
            return whole > 0 ? "\(Int(whole))\(match.1)" : match.1
        }
        return quantity.formatted(.number.precision(.fractionLength(0...2)))
    }

    static func amount(_ quantity: Double?, _ unit: String?) -> String {
        let q = format(quantity)
        let u = unit ?? ""
        if q.isEmpty { return u }
        if u.isEmpty || u == "each" { return q }
        return "\(q) \(u)"
    }

    /// Parses "1 1/2", "1/2", "½", "1.5".
    static func parseAmount(_ input: String) -> Double? {
        var text = input.trimmingCharacters(in: .whitespaces)
        let vulgar: [Character: String] = ["¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅙": "1/6", "⅚": "5/6", "⅕": "1/5"]
        for (char, replacement) in vulgar where text.contains(char) {
            text = text.replacingOccurrences(of: String(char), with: " \(replacement)")
        }
        text = text.replacingOccurrences(of: "⁄", with: "/").trimmingCharacters(in: .whitespaces)
        if text.isEmpty { return nil }
        let parts = text.split(separator: " ").map(String.init)
        func fraction(_ s: String) -> Double? {
            let pieces = s.split(separator: "/")
            guard pieces.count == 2, let n = Double(pieces[0]), let d = Double(pieces[1]), d != 0 else { return nil }
            return n / d
        }
        if parts.count == 2, let whole = Double(parts[0]), let frac = fraction(parts[1]) { return whole + frac }
        if parts.count == 1 { return fraction(parts[0]) ?? Double(parts[0].replacingOccurrences(of: ",", with: ".")) }
        return nil
    }
}
