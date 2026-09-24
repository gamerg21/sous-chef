import Foundation

/// A recipe that has been read from a page, a paste or a model, and still
/// needs the cook's review before it is saved.
struct RecipeDraft: Equatable {
    var title = ""
    var summary: String?
    var servings: Int?
    var totalTimeMinutes: Int?
    var caloriesKcal: Double?
    var proteinGrams: Double?
    var carbsGrams: Double?
    var fatGrams: Double?
    var tags: [String] = []
    var sourceURL: String?
    var notes: String?
    var ingredients: [Ingredient] = []
    var steps: [RecipeStep] = []
    var photo: Data?
    var warnings: [String] = []
}

/// Ingredient-line parsing ported from `src/lib/recipe-capture.ts`: it never
/// invents an amount it cannot read.
enum IngredientParser {
    private static let units = #"fl\.?\s*oz|fluid ounces?|tablespoons?|teaspoons?|tbsps?|tbs|tsps?|milliliters?|millilitres?|liters?|litres?|kilograms?|grams?|ounces?|pounds?|lbs?|cups?|quarts?|qts?|pints?|pts?|gallons?|gal|ml|cl|dl|kg|mg|oz|g|l|each|count|cloves?|slices?|cans?|tins?|jars?|bottles?|packages?|packets?|pkgs?|boxes|box|bags?|sticks?|pinch(?:es)?|dash(?:es)?|sprigs?|bunch(?:es)?|heads?|stalks?|handfuls?|pieces?|pcs?|drops?|leaves|leaf|fillets?|sheets?|envelopes?"#
    private static let amount = #"\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|\d+(?:\.\d+)?"#
    private static let prepWords = #"\b(diced|chopped|minced|sliced|softened|melted|divided|to taste|peeled|room temperature|optional|drained|rinsed|beaten|grated|shredded|crushed|cut|halved|quartered|thinly|finely|roughly|coarsely|packed|sifted|cubed|cooked|uncooked|trimmed|seeded|cored|julienned|torn|zested|juiced|toasted|warmed|cold|chilled|thawed|at room|plus more|or more|for serving|for garnish|to serve|serving|about|such as|like)\b"#

    private static func match(_ pattern: String, _ text: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let result = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        return (0..<result.numberOfRanges).map { index in
            Range(result.range(at: index), in: text).map { String(text[$0]) } ?? ""
        }
    }

    static func clean(_ line: String) -> String {
        line.replacingOccurrences(of: #"^\s*(?:[-•*·▢☐□✓✔◻]|\[\s?\])\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }

    private static func normalizeAmounts(_ text: String) -> String {
        var text = text.replacingOccurrences(of: #"(\d)\s*([¼½¾⅓⅔⅛⅜⅝⅞⅙⅚⅕])"#, with: "$1 $2", options: .regularExpression)
        let vulgar: [String: String] = ["¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅙": "1/6", "⅚": "5/6", "⅕": "1/5"]
        for (char, value) in vulgar { text = text.replacingOccurrences(of: char, with: value) }
        text = text.replacingOccurrences(of: "⁄", with: "/")
        text = text.replacingOccurrences(of: #"^(\d+)\s+(?:and|&|\+)\s+(\d+\s*/\s*\d+)"#, with: "$1 $2", options: [.regularExpression, .caseInsensitive])
        text = text.replacingOccurrences(of: #"^(a|an|one)\s+(?=[a-z])"#, with: "1 ", options: [.regularExpression, .caseInsensitive])
        text = text.replacingOccurrences(of: #"^half\s+(?:a\s+|an\s+)?"#, with: "1/2 ", options: [.regularExpression, .caseInsensitive])
        text = text.replacingOccurrences(of: #"^(pinch|dash|handful|sprig)\b"#, with: "1 $1", options: [.regularExpression, .caseInsensitive])
        return text
    }

    private static func joinNote(_ parts: [String?]) -> String? {
        let note = parts.compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.joined(separator: "; ")
        return note.isEmpty ? nil : note
    }

    private static func finishName(_ raw: String, notes: [String]) -> (name: String, note: String?) {
        var notes = notes
        var name = raw.replacingOccurrences(of: #"^of\s+"#, with: "", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"\*+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        if let paren = match(#"^(.+?)\s*\(([^()]*)\)$"#, name) { name = paren[1]; notes.append(paren[2]) }
        if let comma = name.firstIndex(of: ","), comma != name.startIndex {
            let after = String(name[name.index(after: comma)...])
            if after.range(of: prepWords, options: [.regularExpression, .caseInsensitive]) != nil {
                notes.append(after)
                name = String(name[..<comma]).trimmingCharacters(in: .whitespaces)
            }
        }
        if let size = match(#"^(extra[-\s]large|large|medium|small|jumbo)\s+(.+)$"#, name) {
            notes.insert(size[1].lowercased(), at: 0)
            name = size[2]
        }
        return (name.isEmpty ? raw.trimmingCharacters(in: .whitespaces) : name, joinNote(notes))
    }

    private static func splitLeading(_ rest: String) -> (name: String, notes: [String]) {
        var name = rest.trimmingCharacters(in: .whitespaces)
        var notes: [String] = []
        for _ in 0..<4 {
            if let paren = match(#"^\(([^)]*)\)\s*(.*)$"#, name) { notes.append(paren[1]); name = paren[2] }
            else { break }
        }
        return (name, notes)
    }

    private static func unitAndName(_ rest: String) -> (unit: String?, name: String, note: String?) {
        let first = splitLeading(rest)
        guard let unit = match("^(\(units))\\.?(?:\\s+of)?(?:\\s+|$)(.*)$", first.name) else {
            let finished = finishName(first.name, notes: first.notes)
            return (nil, finished.name, finished.note)
        }
        let second = splitLeading(unit[2])
        let finished = finishName(second.name, notes: first.notes + second.notes)
        let label = unit[1].lowercased().replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return (label, finished.name, finished.note)
    }

    static func parse(_ line: String) -> Ingredient {
        let original = clean(line)
        var text = normalizeAmounts(original)
        if let attached = match("^(\\d+(?:\\.\\d+)?)(\(units))\\b\\.?\\s*(.*)$", text) {
            text = "\(attached[1]) \(attached[2]) \(attached[3])".trimmingCharacters(in: .whitespaces)
        }
        if let ranged = match("^(\(amount))\\s*(?:-|–|—|to|or)\\s*(\(amount))\\s+(.+)$", text) {
            let parsed = unitAndName(ranged[3])
            if parsed.name.isEmpty { return Ingredient(name: original) }
            let measure = "\(ranged[1])–\(ranged[2])\(parsed.unit.map { " \($0)" } ?? "")"
            return Ingredient(name: parsed.name, note: joinNote([measure, parsed.note]))
        }
        guard let single = match("^(\(amount))\\s+(.+)$", text), let quantity = Units.parseAmount(single[1]), quantity > 0 else {
            if let comma = original.firstIndex(of: ","), comma != original.startIndex, original.rangeOfCharacter(from: .decimalDigits) == nil {
                let after = String(original[original.index(after: comma)...])
                if after.range(of: prepWords, options: [.regularExpression, .caseInsensitive]) != nil {
                    return Ingredient(name: String(original[..<comma]).trimmingCharacters(in: .whitespaces), note: after.trimmingCharacters(in: .whitespaces))
                }
            }
            return Ingredient(name: original)
        }
        let parsed = unitAndName(single[2])
        if parsed.name.isEmpty { return Ingredient(name: original) }
        return Ingredient(name: parsed.name, quantity: quantity, unit: parsed.unit ?? "each", note: parsed.note)
    }

    static func looksLikeIngredient(_ line: String) -> Bool {
        if line.range(of: #"^(step\s*\d+|\d+[.)]\s)"#, options: [.regularExpression, .caseInsensitive]) != nil { return false }
        let words = line.split(separator: " ").count
        if line.range(of: "^(\\d|[¼½¾⅓⅔⅛⅜⅝⅞]|(a|an|one|two|three|half)\\s+(\(units)|large|medium|small|few|couple)\\b)", options: [.regularExpression, .caseInsensitive]) != nil {
            return line.count <= 140 && words <= 16
        }
        return words <= 8 && line.range(of: #"\b(to taste|as needed|for (serving|garnish|frying|dusting|greasing)|optional)\b"#, options: [.regularExpression, .caseInsensitive]) != nil
    }
}

/// Deterministic recipe-text reading, used when Apple Intelligence is off.
enum RecipeTextReader {
    static func read(_ text: String, sourceURL: String? = nil, title: String? = nil) -> RecipeDraft {
        let lines = text.components(separatedBy: .newlines).map(IngredientParser.clean).filter { !$0.isEmpty }
        var draft = RecipeDraft(sourceURL: sourceURL)
        enum Section { case intro, ingredients, steps, notes }
        var section = Section.intro
        var intro: [String] = []
        var notes: [String] = []
        for line in lines {
            if line.range(of: #"^(?:the\s+)?ingredients?(?:\s+(?:list|for\b.*))?\s*:?$"#, options: [.regularExpression, .caseInsensitive]) != nil { section = .ingredients; continue }
            if line.range(of: #"^(?:the\s+)?(instructions?|directions?|method|steps?|preparation|how to make(?: it| them)?)\s*:?$"#, options: [.regularExpression, .caseInsensitive]) != nil { section = .steps; continue }
            if line.range(of: #"^(?:recipe\s+)?(notes?|tips|cook'?s notes)\s*:?$"#, options: [.regularExpression, .caseInsensitive]) != nil { section = .notes; continue }
            if section != .steps, let meta = line.range(of: #"^(servings?|serves|yield|makes)\s*:?\s*"#, options: [.regularExpression, .caseInsensitive]) {
                draft.servings = draft.servings ?? Int(line[meta.upperBound...].prefix { $0.isNumber })
                continue
            }
            if section != .steps, let meta = line.range(of: #"^total time\s*:?\s*"#, options: [.regularExpression, .caseInsensitive]) {
                draft.totalTimeMinutes = minutes(String(line[meta.upperBound...]))
                continue
            }
            switch section {
            case .intro:
                if IngredientParser.looksLikeIngredient(line) { section = .ingredients; draft.ingredients.append(IngredientParser.parse(line)) }
                else { intro.append(line) }
            case .ingredients:
                if !IngredientParser.looksLikeIngredient(line) && line.split(separator: " ").count >= 8 {
                    section = .steps
                    draft.steps.append(RecipeStep(text: stripNumber(line)))
                } else if line.count <= 50, line.hasSuffix(":"), line.rangeOfCharacter(from: .decimalDigits) == nil {
                    continue
                } else {
                    draft.ingredients.append(IngredientParser.parse(line))
                }
            case .steps: draft.steps.append(RecipeStep(text: stripNumber(line)))
            case .notes: notes.append(line)
            }
        }
        draft.title = title ?? intro.first ?? ""
        if intro.count > 1 { draft.summary = intro.dropFirst().joined(separator: " ").prefix(2000).description }
        if !notes.isEmpty { draft.notes = notes.joined(separator: "\n") }
        if draft.title.isEmpty { draft.warnings.append("Add a title.") }
        if draft.ingredients.isEmpty { draft.warnings.append("No ingredients were found. Add them in the editor.") }
        if draft.steps.isEmpty { draft.warnings.append("No steps were found. Add them in the editor.") }
        return draft
    }

    static func stripNumber(_ line: String) -> String {
        line.replacingOccurrences(of: #"^(step\s*\d+\s*[:.)-]?|\d+[.)])\s*"#, with: "", options: [.regularExpression, .caseInsensitive])
    }

    static func minutes(_ text: String) -> Int? {
        func number(_ pattern: String) -> Double {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
                  let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
                  let range = Range(match.range(at: 1), in: text) else { return 0 }
            return Double(text[range]) ?? 0
        }
        let total = Int((number(#"(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\b"#) * 60 + number(#"(\d+)\s*(?:m|min|mins|minutes?)\b"#)).rounded())
        return total > 0 ? total : nil
    }
}
