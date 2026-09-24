import Foundation

/// Turns a recipe web page into an editable draft. Most recipe sites publish
/// schema.org Recipe JSON-LD; ported from `src/lib/recipe-import.ts`.
enum RecipeImporter {
    enum ImportError: LocalizedError {
        case badURL, unreadable(String), noRecipe(String)
        var errorDescription: String? {
            switch self {
            case .badURL: "Use a full recipe link, starting with https://"
            case .unreadable(let site): "Couldn't open \(site). Check the link and your connection."
            case .noRecipe(let site): "Couldn't find a recipe on \(site). Copy the recipe text from the page and paste it instead."
            }
        }
    }

    /// Fetches a page. Structured data wins; otherwise the page text is read
    /// by Apple Intelligence when available, then by local heuristics.
    static func importRecipe(from link: String, ai: KitchenAI) async throws -> RecipeDraft {
        guard let url = URL(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme), url.host != nil else { throw ImportError.badURL }
        let site = (url.host ?? "").replacingOccurrences(of: "www.", with: "")
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
        request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
        let data: Data
        do {
            let (body, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw ImportError.unreadable(site) }
            data = body.prefix(4_000_000)
        } catch let error as ImportError { throw error } catch { throw ImportError.unreadable(site) }
        let html = String(decoding: data, as: UTF8.self)

        if let structured = fromHTML(html, pageURL: url) {
            var recipe = structured.recipe
            if let imageURL = structured.photoURL { recipe.photo = await downloadImage(imageURL) }
            return recipe
        }
        let text = htmlToText(html)
        let section = recipeSection(text)
        guard !section.isEmpty else { throw ImportError.noRecipe(site) }
        var draft: RecipeDraft
        if ai.isAvailable, let generated = try? await ai.readRecipe(from: section, sourceURL: url.absoluteString) {
            draft = generated
            draft.warnings.insert("\(site) doesn't publish recipe data, so Apple Intelligence read the page. Check everything carefully.", at: 0)
        } else {
            draft = RecipeTextReader.read(section, sourceURL: url.absoluteString, title: pageTitle(html))
            draft.warnings.insert("\(site) doesn't publish recipe data, so Sous Chef read the page text. Check everything carefully.", at: 0)
        }
        guard !draft.ingredients.isEmpty else { throw ImportError.noRecipe(site) }
        draft.sourceURL = url.absoluteString
        draft.notes = draft.notes ?? "Imported from \(site). Check ingredient names, quantities, and units before cooking."
        return draft
    }

    struct Structured {
        var recipe: RecipeDraft
        var photoURL: URL?
    }

    static func fromHTML(_ html: String, pageURL: URL) -> Structured? {
        let candidates = findJsonLdRecipes(html).map { recipe(from: $0, pageURL: pageURL) }
        guard var best = candidates.max(by: { ($0.recipe.ingredients.count + $0.recipe.steps.count) < ($1.recipe.ingredients.count + $1.recipe.steps.count) }),
              !best.recipe.ingredients.isEmpty else { return nil }
        if best.recipe.title.isEmpty { best.recipe.title = pageTitle(html) }
        best.recipe.warnings.removeAll { $0.hasPrefix("Add a title") && !best.recipe.title.isEmpty }
        return best
    }

    // MARK: JSON-LD

    static func findJsonLdRecipes(_ html: String) -> [[String: Any]] {
        var found: [[String: Any]] = []
        func visit(_ node: Any?, depth: Int) {
            guard let node, depth <= 8 else { return }
            if let array = node as? [Any] { array.forEach { visit($0, depth: depth + 1) }; return }
            guard let record = node as? [String: Any] else { return }
            if types(record).contains("recipe") { found.append(record) }
            for key in ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item", "hasPart"] { visit(record[key], depth: depth + 1) }
        }
        let pattern = #"<script\b[^>]*type\s*=\s*["']?application/ld\+json["']?[^>]*>([\s\S]*?)</script>"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return [] }
        for match in regex.matches(in: html, range: NSRange(html.startIndex..., in: html)) {
            guard let range = Range(match.range(at: 1), in: html) else { continue }
            visit(parseJSON(String(html[range])), depth: 0)
        }
        return found
    }

    private static func parseJSON(_ raw: String) -> Any? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^<!--|-->$"#, with: "", options: .regularExpression)
        if let value = try? JSONSerialization.jsonObject(with: Data(text.utf8), options: [.fragmentsAllowed]) { return value }
        let flattened = text.replacingOccurrences(of: #"[\u0000-\u001f]+"#, with: " ", options: .regularExpression)
        return try? JSONSerialization.jsonObject(with: Data(flattened.utf8), options: [.fragmentsAllowed])
    }

    private static func list(_ value: Any?) -> [Any] {
        guard let value, !(value is NSNull) else { return [] }
        return (value as? [Any]) ?? [value]
    }

    private static func types(_ node: [String: Any]) -> [String] {
        list(node["@type"]).map { String(describing: $0).replacingOccurrences(of: #"^.*[/:]"#, with: "", options: .regularExpression).lowercased() }
    }

    static func decodeEntities(_ text: String) -> String {
        let named: [String: String] = ["amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ", "ndash": "–", "mdash": "—", "hellip": "…", "deg": "°",
                                       "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "frac12": "½", "frac14": "¼", "frac34": "¾", "frac13": "⅓", "frac23": "⅔",
                                       "times": "×", "eacute": "é", "egrave": "è", "ntilde": "ñ", "uuml": "ü", "ouml": "ö", "auml": "ä", "ccedil": "ç", "reg": "®", "trade": "™", "copy": "©"]
        guard let regex = try? NSRegularExpression(pattern: "&(#x[0-9a-f]+|#\\d+|[a-z][a-z0-9]*);", options: .caseInsensitive) else { return text }
        var result = ""
        var last = text.startIndex
        for match in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let whole = Range(match.range, in: text), let codeRange = Range(match.range(at: 1), in: text) else { continue }
            result += text[last..<whole.lowerBound]
            let code = String(text[codeRange])
            var replacement: String?
            if code.hasPrefix("#") {
                let scalarValue = code.dropFirst().lowercased().hasPrefix("x") ? UInt32(code.dropFirst(2), radix: 16) : UInt32(code.dropFirst())
                replacement = scalarValue.flatMap(Unicode.Scalar.init).map { String(Character($0)) }
            } else {
                replacement = named[code.lowercased()]
            }
            result += replacement ?? String(text[whole])
            last = whole.upperBound
        }
        result += text[last...]
        return result
    }

    /// Plain text from a JSON-LD string field, which sites often fill with HTML.
    static func plain(_ value: Any?) -> String {
        guard let value = value as? String else { return "" }
        var text = decodeEntities(value)
        for _ in 0..<2 where text.range(of: #"<[a-z/!]"#, options: [.regularExpression, .caseInsensitive]) != nil {
            text = decodeEntities(text
                .replacingOccurrences(of: #"<br\s*/?>"#, with: "\n", options: [.regularExpression, .caseInsensitive])
                .replacingOccurrences(of: #"</(p|li|div|h\d)>"#, with: "\n", options: [.regularExpression, .caseInsensitive])
                .replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression))
        }
        return text.replacingOccurrences(of: "[ \t\u{00a0}]+", with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s*\n\s*"#, with: "\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func parseDuration(_ value: Any?) -> Int? {
        guard let value = value as? String else { return nil }
        let pattern = #"^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return nil }
        let text = value.trimmingCharacters(in: .whitespaces)
        guard let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) else { return nil }
        func group(_ index: Int) -> Double { Range(match.range(at: index), in: text).flatMap { Double(text[$0]) } ?? 0 }
        let minutes = Int((group(1) * 1440 + group(2) * 60 + group(3)).rounded())
        return minutes > 0 && minutes < 60 * 24 * 14 ? minutes : nil
    }

    private static func firstNumber(_ value: Any?) -> Double? {
        for item in list(value) {
            if let number = item as? Double, number > 0 { return number }
            if let number = item as? Int, number > 0 { return Double(number) }
            let text = plain(item)
            if let range = text.range(of: #"\d+(?:\.\d+)?"#, options: .regularExpression), let number = Double(text[range]), number > 0 { return number }
        }
        return nil
    }

    static func instructionLines(_ value: Any?, depth: Int = 0) -> [String] {
        guard depth <= 5, let value else { return [] }
        if let string = value as? String {
            let text = plain(string)
            let lines = text.components(separatedBy: "\n")
            if lines.count == 1, text.range(of: #"(^|\s)\d+[.)]\s"#, options: .regularExpression) != nil {
                return text.replacingOccurrences(of: #"(?:^|\s)(?=\d+[.)]\s)"#, with: "\u{1}", options: .regularExpression)
                    .components(separatedBy: "\u{1}")
                    .map { RecipeTextReader.stripNumber($0).trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty }
            }
            return lines.map { RecipeTextReader.stripNumber($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }
        if let array = value as? [Any] { return array.flatMap { instructionLines($0, depth: depth + 1) } }
        if let record = value as? [String: Any] {
            if types(record).contains("howtosection") || (record["itemListElement"] != nil && record["text"] == nil) {
                let steps = instructionLines(record["itemListElement"], depth: depth + 1)
                let name = plain(record["name"])
                if !name.isEmpty, let first = steps.first { return ["\(name): \(first)"] + steps.dropFirst() }
                return steps
            }
            let text = [plain(record["text"]), plain(record["name"]), plain(record["description"])].first { !$0.isEmpty } ?? ""
            return text.isEmpty ? [] : instructionLines(text, depth: depth + 1)
        }
        return []
    }

    static func recipe(from node: [String: Any], pageURL: URL) -> Structured {
        var draft = RecipeDraft()
        draft.title = [plain(node["name"]), plain(node["headline"])].first { !$0.isEmpty } ?? ""
        let lines = list(node["recipeIngredient"] ?? node["ingredients"]).map(plain).flatMap { $0.components(separatedBy: "\n") }.filter { !$0.isEmpty }.prefix(100)
        draft.ingredients = lines.map(IngredientParser.parse)
        draft.steps = instructionLines(node["recipeInstructions"]).prefix(100).map { RecipeStep(text: $0) }
        let nutrition = node["nutrition"] as? [String: Any] ?? [:]
        draft.caloriesKcal = firstNumber(nutrition["calories"]).map { $0.rounded() }
        draft.proteinGrams = firstNumber(nutrition["proteinContent"]).map { ($0 * 10).rounded() / 10 }
        draft.carbsGrams = firstNumber(nutrition["carbohydrateContent"]).map { ($0 * 10).rounded() / 10 }
        draft.fatGrams = firstNumber(nutrition["fatContent"]).map { ($0 * 10).rounded() / 10 }
        let tagSources = list(node["recipeCategory"]) + list(node["recipeCuisine"]) + list(node["keywords"]).flatMap { plain($0).components(separatedBy: ",") as [Any] }
        var seen = Set<String>()
        draft.tags = tagSources.map { plain($0).lowercased() }.filter { !$0.isEmpty && $0.count <= 40 && seen.insert($0).inserted }.prefix(10).map { $0 }
        let author = list(node["author"]).map { plain(($0 as? [String: Any])?["name"] ?? $0) }.filter { !$0.isEmpty }.joined(separator: ", ")
        if let canonical = node["url"] as? String, canonical.lowercased().hasPrefix("http") { draft.sourceURL = canonical } else { draft.sourceURL = pageURL.absoluteString }
        let host = (pageURL.host ?? "").replacingOccurrences(of: "www.", with: "")
        draft.summary = String(plain(node["description"]).prefix(2000)).nilIfEmpty
        draft.servings = firstNumber(node["recipeYield"] ?? node["yield"]).map { Int($0) }
        if let total = parseDuration(node["totalTime"]) { draft.totalTimeMinutes = total }
        else {
            let sum = (parseDuration(node["prepTime"]) ?? 0) + (parseDuration(node["cookTime"]) ?? 0)
            draft.totalTimeMinutes = sum > 0 ? sum : nil
        }
        draft.notes = "Imported from \(host)\(author.isEmpty ? "" : " (recipe by \(author))"). Check ingredient names, quantities, and units before cooking."
        if draft.title.isEmpty { draft.warnings.append("Add a title — the site did not include one.") }
        if draft.ingredients.isEmpty { draft.warnings.append("The site did not list ingredients. Add them in the editor.") }
        if draft.steps.isEmpty { draft.warnings.append("The site did not list steps. Add them in the editor.") }
        let uncertain = draft.ingredients.filter { $0.quantity == nil && $0.name.rangeOfCharacter(from: .decimalDigits) != nil }.count
        if uncertain > 0 { draft.warnings.append("\(uncertain) ingredient amount\(uncertain == 1 ? "" : "s") could not be read — check \(uncertain == 1 ? "it" : "them") in the editor.") }

        var photoURL: URL?
        for image in list(node["image"]) {
            let candidate = (image as? String) ?? ((image as? [String: Any])?["url"] as? String)
            if let candidate, let url = URL(string: candidate, relativeTo: pageURL), url.scheme?.hasPrefix("http") == true { photoURL = url.absoluteURL; break }
        }
        return Structured(recipe: draft, photoURL: photoURL)
    }

    static func downloadImage(_ url: URL) async -> Data? {
        guard let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200, data.count < 8_000_000 else { return nil }
        return ImageTools.compressed(data)
    }

    // MARK: Page text

    static func pageTitle(_ html: String) -> String {
        func capture(_ pattern: String) -> String? {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
                  let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
                  let range = Range(match.range(at: 1), in: html) else { return nil }
            return String(html[range])
        }
        let og = capture(#"<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:title|twitter:title)["'][^>]*content\s*=\s*["']([^"']*)["']"#)
        let title = [plain(og), plain(capture(#"<h1\b[^>]*>([\s\S]*?)</h1>"#)), plain(capture(#"<title\b[^>]*>([\s\S]*?)</title>"#))].first { !$0.isEmpty } ?? ""
        return title.components(separatedBy: " | ").first?.components(separatedBy: " - ").first?.trimmingCharacters(in: .whitespaces) ?? title
    }

    static func htmlToText(_ html: String) -> String {
        let body = html
            .replacingOccurrences(of: #"<!--[\s\S]*?-->"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"<(script|style|noscript|svg|template|iframe|nav|header|footer|aside|form|button|select)\b[\s\S]*?</\1>"#, with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"<li\b[^>]*>"#, with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"</?(p|div|section|article|br|tr|h\d|ul|ol|li|dt|dd|table)\b[^>]*>"#, with: "\n", options: [.regularExpression, .caseInsensitive])
        return plain(body)
    }

    /// The part of the page between "Ingredients" and the comments.
    static func recipeSection(_ text: String) -> String {
        let lines = text.components(separatedBy: "\n")
        guard let start = lines.firstIndex(where: { $0.trimmingCharacters(in: .whitespaces).range(of: #"^(?:the\s+)?ingredients?\b.{0,30}$"#, options: [.regularExpression, .caseInsensitive]) != nil }) else { return "" }
        let rest = Array(lines[start..<min(lines.count, start + 400)])
        let stop = rest.indices.dropFirst().first { rest[$0].trimmingCharacters(in: .whitespaces).range(of: #"^(nutrition(?: facts| information)?|comments?|reviews?|leave a (comment|reply|review)|related( recipes| posts)?|you (may|might) also like|more recipes|about (me|the author)|reader interactions)\b.{0,20}$"#, options: [.regularExpression, .caseInsensitive]) != nil }
        return String((stop.map { rest[..<$0] } ?? rest[...]).joined(separator: "\n").prefix(50_000))
    }
}

extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
