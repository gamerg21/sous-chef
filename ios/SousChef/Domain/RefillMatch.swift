import Foundation

/// Finds the pantry item a new purchase should refill, so scanning another
/// brand of milk tops up "Milk" instead of adding a second item.
nonisolated enum RefillMatch {
    enum Confidence: Equatable {
        /// The same barcode, or the same name once the brand and plurals are set aside.
        case strong
        /// The same food with different qualifiers: "Organic Whole Milk" and "Milk".
        case weak
    }

    /// What the matcher needs from a pantry item.
    struct Stocked: Equatable {
        var id: UUID
        var name: String
        var brand: String?
        var barcode: String?
        var quantity: Double
        /// The catalog spelling ("each", "l"), so "liters" and "l" compare equal.
        var unit: String
        var createdAt: Date

        var isOut: Bool { quantity <= 0 }
    }

    struct Result: Equatable {
        var id: UUID
        var confidence: Confidence
        var isOut: Bool

        /// A loose match is only worth offering for an item that needs restocking.
        var isOffered: Bool { confidence == .strong || isOut }
        /// Refilling is the default only when it's surely the same food and it's out.
        var defaultOn: Bool { confidence == .strong && isOut }
    }

    /// Words that describe a food without changing which food it is.
    private static let qualifiers: Set<String> = Set([
        "organic", "whole", "fresh", "large", "medium", "small", "extra", "jumbo", "natural", "original", "classic", "pure", "raw",
        "low", "reduced", "free", "fat", "nonfat", "lowfat", "skim", "skimmed", "lite", "light", "unsalted", "salted",
        "1%", "2%", "grade", "a", "aa", "the", "of", "and",
    ].map(FoodWords.stem))

    /// Extra words that make it a different food: oat milk isn't milk.
    private static let differentFoods: Set<String> = Set([
        "oat", "almond", "soy", "coconut", "cashew", "rice", "hemp", "pea", "goat", "sheep", "chocolate", "strawberry", "vanilla",
        "peanut", "nut", "sunflower", "apple", "sour", "ice", "cream", "sweet", "evaporated", "condensed", "powdered", "dried", "frozen",
    ].map(FoodWords.stem))

    /// The name's words without a leading or trailing brand.
    static func foodWords(name: String, brand: String?) -> [String] {
        let words = FoodWords.stems(name)
        let brand = FoodWords.stems(brand)
        guard !brand.isEmpty, words.count > brand.count else { return words }
        if Array(words.prefix(brand.count)) == brand { return Array(words.dropFirst(brand.count)) }
        if Array(words.suffix(brand.count)) == brand { return Array(words.dropLast(brand.count)) }
        return words
    }

    /// The strong name rule: the same words once the brand and simple plurals are set aside.
    static func sameFood(_ name: String, brand: String? = nil, as other: String, otherBrand: String? = nil) -> Bool {
        let words = foodWords(name: name, brand: brand)
        return !words.isEmpty && words == foodWords(name: other, brand: otherBrand)
    }

    private static func core(_ words: [String]) -> [String] {
        let kept = words.filter { !qualifiers.contains($0) }
        return kept.isEmpty ? words : kept
    }

    /// The best item to refill with a new purchase, or nil when nothing is
    /// clearly the same food. An item in stock in another `unit` is skipped:
    /// its amount can't simply be added to.
    static func best(name: String, brand: String? = nil, barcode: String? = nil, unit: String, in items: [Stocked]) -> Result? {
        let usable = items.filter { $0.isOut || normalizeName($0.unit) == normalizeName(unit) }
        let code = barcode?.trimmingCharacters(in: .whitespaces) ?? ""
        let words = foodWords(name: name, brand: brand)

        let sameCode = usable.filter { !code.isEmpty && $0.barcode == code }
        let sameName = words.isEmpty ? [] : usable.filter { words == foodWords(name: $0.name, brand: $0.brand) }
        if let pick = preferred(sameCode + sameName, barcode: code) {
            return Result(id: pick.id, confidence: .strong, isOut: pick.isOut)
        }

        // Loose: one name's words contain the other's once qualifiers are dropped.
        // Every pantry item counts here, so two different foods that both fit
        // ("Oat milk" and "Whole milk" for "Milk") mean no match at all.
        let wanted = core(words)
        guard !wanted.isEmpty else { return nil }
        let loose = items.compactMap { item -> (item: Stocked, core: [String])? in
            let theirs = core(foodWords(name: item.name, brand: item.brand))
            guard !theirs.isEmpty, Set(theirs).isSuperset(of: wanted) || Set(wanted).isSuperset(of: theirs) else { return nil }
            return (item, theirs)
        }
        guard let food = loose.first?.core, loose.allSatisfy({ Set($0.core) == Set(food) }), isSameKind(wanted, food) else { return nil }
        let candidates = loose.map(\.item).filter { item in usable.contains { $0.id == item.id } }
        guard let pick = preferred(candidates, barcode: code) else { return nil }
        return Result(id: pick.id, confidence: .weak, isOut: pick.isOut)
    }

    /// Whether two word lists, one containing the other, name one kind of
    /// food: they end in the same word ("cheddar cheese" and "cheese", not
    /// "chicken broth" and "chicken"), and the extra words aren't a different
    /// food ("oat" milk).
    private static func isSameKind(_ left: [String], _ right: [String]) -> Bool {
        guard left.last == right.last else { return false }
        let extra = Set(left).symmetricDifference(Set(right))
        return extra.isDisjoint(with: differentFoods)
    }

    /// Out before in stock, then a barcode match, then the newest.
    private static func preferred(_ items: [Stocked], barcode: String) -> Stocked? {
        items.max { left, right in
            if left.isOut != right.isOut { return right.isOut }
            let leftCode = !barcode.isEmpty && left.barcode == barcode, rightCode = !barcode.isEmpty && right.barcode == barcode
            if leftCode != rightCode { return rightCode }
            return left.createdAt < right.createdAt
        }
    }
}

extension PantryItem {
    @MainActor var refillCandidate: RefillMatch.Stocked {
        RefillMatch.Stocked(id: uuid, name: name, brand: brand, barcode: barcode, quantity: quantity,
                            unit: Units.find(unit)?.label ?? unit, createdAt: createdAt)
    }
}
