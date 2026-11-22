import Foundation

/// Food names as comparable words: lowercase, no punctuation or accents, and
/// with simple plurals folded together ("Potatoes" and "potato" are one word).
nonisolated enum FoodWords {
    /// "Half & Half, 2%" → ["half", "and", "half", "2%"].
    static func words(_ text: String?) -> [String] {
        (text ?? "").folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .split { !($0.isLetter || $0.isNumber || $0 == "%") }
            .map(String.init)
    }

    /// One spelling for a word and its simple plural. The result isn't always
    /// a real word ("cheese" → "chees"); it only has to match itself.
    static func stem(_ word: String) -> String {
        var word = word
        if word.count > 3, word.hasSuffix("s"), !word.hasSuffix("ss") { word.removeLast() }
        if word.count > 4, word.hasSuffix("e") { word.removeLast() }
        if word.count > 3, word.hasSuffix("y") { word = String(word.dropLast()) + "i" }
        return word
    }

    static func stems(_ text: String?) -> [String] { words(text).map(stem) }
}

/// Where a food normally goes before it's opened, from its name and, failing
/// that, its category. The web app reads the same list and matches it the same way.
nonisolated enum StoragePlacement {
    struct Suggestion: Equatable {
        var location: StorageLocation
        /// What decided it: the matched words ("milk") or the category ("Dairy").
        var basis: String
    }

    static func suggest(name: String, category: String? = nil) -> StorageLocation? {
        suggestion(name: name, category: category)?.location
    }

    static func suggestion(name: String, category: String? = nil) -> Suggestion? {
        if let term = table.match(FoodWords.words(name)) { return Suggestion(location: term.location, basis: term.text) }
        guard let category = category?.trimmingCharacters(in: .whitespaces), !category.isEmpty,
              let location = categories[category.lowercased()] else { return nil }
        return Suggestion(location: location, basis: category)
    }

    // MARK: The list

    /// A word or phrase to find as whole words. "=" in front in the list
    /// matches the spelling exactly: "=greens" isn't "green".
    private struct Term {
        let text: String
        let location: StorageLocation
        let parts: [String]
        let exact: Bool

        init(_ raw: String, _ location: StorageLocation) {
            exact = raw.hasPrefix("=")
            text = exact ? String(raw.dropFirst()) : raw
            parts = exact ? FoodWords.words(text) : FoodWords.stems(text)
            self.location = location
        }

        /// The index just past the last place the term appears.
        func lastEnd(words: [String], stems: [String]) -> Int? {
            let haystack = exact ? words : stems
            guard !parts.isEmpty, haystack.count >= parts.count else { return nil }
            for start in stride(from: haystack.count - parts.count, through: 0, by: -1)
            where Array(haystack[start..<(start + parts.count)]) == parts {
                return start + parts.count
            }
            return nil
        }
    }

    private struct Table {
        /// How the food is sold ("frozen", "canned"): settles it wherever it appears.
        var modifiers: [Term] = []
        var foods: [Term] = []
        /// "Tuna in water", "yogurt with granola": the food comes before these.
        static let prepositions: Set<String> = ["with", "in", "for", "from"]

        func match(_ words: [String]) -> Term? {
            guard !words.isEmpty else { return nil }
            if words == ["ice"] { return Term("=ice", .freezer) }
            let stems = words.map(FoodWords.stem)
            if let modifier = modifiers.first(where: { $0.lastEnd(words: words, stems: stems) != nil }) { return modifier }
            if let cut = words.firstIndex(where: Self.prepositions.contains), cut > 0,
               let head = best(Array(words[..<cut]), Array(stems[..<cut])) { return head }
            return best(words, stems)
        }

        /// English puts the food last ("chicken soup" is soup, "egg noodles"
        /// are noodles), so the term ending latest wins; of two ending
        /// together the longer ("peanut butter" over "butter"), then the
        /// exact spelling.
        private func best(_ words: [String], _ stems: [String]) -> Term? {
            var best: (term: Term, end: Int)?
            for term in foods {
                guard let end = term.lastEnd(words: words, stems: stems) else { continue }
                if let current = best {
                    let longer = term.parts.count > current.term.parts.count
                    let exacter = term.parts.count == current.term.parts.count && term.exact && !current.term.exact
                    guard end > current.end || (end == current.end && (longer || exacter)) else { continue }
                }
                best = (term, end)
            }
            return best?.term
        }
    }

    private struct Lists: Decodable {
        var modifiers: [String: [String]]
        var foods: [String: [String]]
    }

    /// `FoodStorage.json`, the same file the web app reads as `food-storage.json`.
    private static let table: Table = {
        guard let url = Bundle.main.url(forResource: "FoodStorage", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let lists = try? JSONDecoder().decode(Lists.self, from: data) else { return Table() }
        let order: [StorageLocation] = [.freezer, .fridge, .pantry]
        func terms(_ group: [String: [String]]) -> [Term] {
            order.flatMap { location in (group[location.rawValue] ?? []).map { Term($0, location) } }
        }
        return Table(modifiers: terms(lists.modifiers), foods: terms(lists.foods))
    }()

    /// Used when the name says nothing. Keyed by `ShoppingCategories.all`, lowercased.
    private static let categories: [String: StorageLocation] = [
        "dairy": .fridge, "meat & seafood": .fridge, "produce": .fridge,
        "frozen": .freezer,
        "pantry": .pantry, "bakery": .pantry, "canned goods": .pantry, "grains & rice": .pantry,
        "pasta & noodles": .pantry, "spices & seasonings": .pantry, "condiments & sauces": .pantry, "snacks": .pantry,
    ]
}
