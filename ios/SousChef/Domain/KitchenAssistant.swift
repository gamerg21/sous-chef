import Foundation

/// Kitchen answers shaped for Siri and Shortcuts. The intents in `Intents/`
/// stay thin; the decisions live here so they can be unit tested.
extension Kitchen {
    /// Items actually on hand, soonest to expire first, then by name.
    func onHand(in location: StorageLocation? = nil) -> [PantryItem] {
        fetch(PantryItem.self)
            .filter { $0.quantity > 0 && (location == nil || $0.location == location) }
            .sorted {
                let left = $0.expiresOn ?? .distantFuture, right = $1.expiresOn ?? .distantFuture
                return left == right ? $0.name.localizedStandardCompare($1.name) == .orderedAscending : left < right
            }
    }

    /// On-hand items expiring by the end of the day `days` from now
    /// (including anything already past its date).
    func expiringSoon(within days: Int = 3, now: Date = Date()) -> [PantryItem] {
        Self.expiring(onHand(), within: days, now: now)
    }

    static func expiring(_ items: [PantryItem], within days: Int = 3, now: Date = Date()) -> [PantryItem] {
        let limit = Calendar.current.date(byAdding: .day, value: days + 1, to: Calendar.current.startOfDay(for: now)) ?? now
        return items.filter { $0.quantity > 0 && ($0.expiresOn ?? .distantFuture) < limit }
    }

    struct RecipeSuggestion: Identifiable {
        var recipe: Recipe
        var plan: CookingPlan
        /// Ingredients that draw on items expiring within three days.
        var usesExpiring: [String]

        var id: UUID { recipe.uuid }
        var missing: Int { plan.missingIngredients.count }
    }

    /// Every recipe with ingredients, ranked by how well the pantry covers
    /// it: nothing missing first, then recipes that use up food about to
    /// expire, then favorites, then whatever hasn't been cooked in a while.
    /// The Cook tab and Siri both use this order.
    static func rankRecipes(_ recipes: [Recipe], pantry: [PantryItem], now: Date = Date()) -> [RecipeSuggestion] {
        let stock = pantry.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
        let expiring = Set(Self.expiring(pantry, now: now).map { normalizeName($0.name) })
        return recipes.compactMap { recipe -> RecipeSuggestion? in
            let ingredients = recipe.ingredients
            guard !ingredients.isEmpty else { return nil }
            return RecipeSuggestion(recipe: recipe, plan: CookingPlanner.plan(ingredients: ingredients, stock: stock),
                                    usesExpiring: ingredients.filter { expiring.contains(normalizeName($0.pantryName)) }.map(\.name))
        }
        .sorted { a, b in
            if a.missing != b.missing { return a.missing < b.missing }
            if a.usesExpiring.count != b.usesExpiring.count { return a.usesExpiring.count > b.usesExpiring.count }
            if a.recipe.favorited != b.recipe.favorited { return a.recipe.favorited }
            let aCooked = a.recipe.lastCookedAt ?? .distantPast, bCooked = b.recipe.lastCookedAt ?? .distantPast
            if aCooked != bCooked { return aCooked < bCooked }
            return a.recipe.title.localizedStandardCompare(b.recipe.title) == .orderedAscending
        }
    }

    /// The best few recipes that use at least something from the pantry.
    func suggestRecipes(limit: Int = 3, now: Date = Date()) -> [RecipeSuggestion] {
        Self.rankRecipes(fetch(Recipe.self), pantry: fetch(PantryItem.self), now: now)
            .filter { $0.plan.availableCount > 0 }
            .prefix(limit)
            .map { $0 }
    }

    func openShoppingItems() -> [ShoppingItem] {
        fetch(ShoppingItem.self).filter { !$0.checked }.sorted { $0.createdAt < $1.createdAt }
    }

    /// Adds each spoken item unless the same food is already waiting on the
    /// list. Returns the items that were added.
    @discardableResult
    func addToShoppingList(_ names: [String]) -> [ShoppingItem] {
        var added: [ShoppingItem] = []
        for name in names {
            let before = Set(fetch(ShoppingItem.self).map(\.uuid))
            let parsedName = IngredientParser.parse(name).name
            if openShoppingItems().contains(where: { normalizeName($0.name) == normalizeName(parsedName) || normalizeName($0.name) == normalizeName(name) }) { continue }
            addShopping(name)
            added += fetch(ShoppingItem.self).filter { !before.contains($0.uuid) }
        }
        return added
    }

    /// Checks off every open list entry for the named food.
    @discardableResult
    func checkOff(_ name: String) -> [ShoppingItem] {
        let matches = Self.bestMatches(for: name, in: openShoppingItems(), name: \.name)
        for item in matches {
            item.checked = true
            item.touch()
        }
        if !matches.isEmpty { changed() }
        return matches
    }

    struct RanOut {
        var emptied: [PantryItem]
        var addedToList: Bool
    }

    /// Marks a food as used up and puts it on the shopping list. Batches stay
    /// as empty placeholders, like the pantry's own "used up" action, so the
    /// next purchase refills them in place. Only exact names are emptied;
    /// `RanOutIntent` confirms a close match before calling this.
    func ranOut(of name: String) -> RanOut {
        let emptied = onHand().filter { normalizeName($0.name) == normalizeName(name) }
        for item in emptied {
            item.quantity = 0
            item.touch()
        }
        let display = emptied.first?.name ?? name.trimmingCharacters(in: .whitespacesAndNewlines)
        let added = !addToShoppingList([display]).isEmpty
        changed()
        return RanOut(emptied: emptied, addedToList: added)
    }

    /// Exact name matches when there are any. Otherwise a whole-word match
    /// either way ("milk" finds "Whole milk"), but only when every hit is the
    /// same food, so "butter" never touches both butter and peanut butter.
    nonisolated static func bestMatches<T>(for spoken: String, in items: [T], name: (T) -> String) -> [T] {
        let wanted = normalizeName(spoken)
        guard !wanted.isEmpty else { return [] }
        let exact = items.filter { normalizeName(name($0)) == wanted }
        if !exact.isEmpty { return exact }
        let words = Set(wanted.split(separator: " "))
        let loose = items.filter {
            let candidate = Set(normalizeName(name($0)).split(separator: " "))
            return candidate.isSuperset(of: words) || words.isSuperset(of: candidate)
        }
        return Set(loose.map { normalizeName(name($0)) }).count == 1 ? loose : []
    }

    /// Foods whose names contain "and", kept whole when splitting a list.
    nonisolated private static let compoundFoods = ["macaroni and cheese", "mac and cheese", "salt and pepper", "half and half",
                                                    "sweet and sour", "fish and chips", "peanut butter and jelly"]

    /// Splits "milk, eggs and a loaf of bread" into separate items.
    nonisolated static func splitSpokenList(_ text: String) -> [String] {
        var text = text
        for food in compoundFoods {
            let parts = food.components(separatedBy: " and ")
            text = text.replacingOccurrences(of: #"\b(\#(parts[0])) and (\#(parts[1]))\b"#, with: "$1 \u{1E} $2", options: [.regularExpression, .caseInsensitive])
        }
        return text.replacingOccurrences(of: #"\s*(,|;|\n|\band\b|&|\+)\s*"#, with: "\u{1F}", options: [.regularExpression, .caseInsensitive])
            .split(separator: "\u{1F}")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines.union(.punctuationCharacters)) }
            .map { $0.replacingOccurrences(of: "\u{1E}", with: "and") }
            .filter { !$0.isEmpty }
    }

    /// "a", "a and b", "a, b and c" — shortened for speech past `limit`.
    nonisolated static func spokenList(_ items: [String], limit: Int = 5) -> String {
        guard items.count > limit else { return ListFormatter.localizedString(byJoining: items) }
        return ListFormatter.localizedString(byJoining: Array(items.prefix(limit)) + ["\(items.count - limit) more"])
    }

    // MARK: Saving recipes

    /// The link to import when text handed to Siri is really just a link,
    /// perhaps with the page title ("Million Dollar Soup https://…"). Recipe
    /// text that merely cites its source stays text.
    nonisolated static func recipeLink(in text: String) -> URL? {
        SharedRecipeInbox.link(in: text)
    }

    /// The same page whatever the "www.", trailing slash or tracking
    /// parameters, so saving a link twice doesn't duplicate the recipe.
    nonisolated static func pageKey(_ url: URL) -> String {
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url.absoluteString }
        let host = (parts.host ?? "").lowercased().replacingOccurrences(of: #"^www\."#, with: "", options: .regularExpression)
        var path = parts.path
        while path.hasSuffix("/") { path.removeLast() }
        parts.queryItems = parts.queryItems?.filter { !$0.name.lowercased().hasPrefix("utm_") && !["fbclid", "gclid"].contains($0.name.lowercased()) }
        let query = (parts.queryItems ?? []).isEmpty ? "" : "?" + (parts.percentEncodedQuery ?? "")
        return host + path + query
    }

    /// A saved recipe imported from the same page.
    func recipe(importedFrom url: URL) -> Recipe? {
        let key = Self.pageKey(url)
        return fetch(Recipe.self).first { $0.sourceURL.flatMap(URL.init(string:)).map(Self.pageKey) == key }
    }

    /// A recipe read from a page or pasted text, ready to save without the
    /// editor: nil when no ingredients were found, and titled if the source
    /// had no title.
    nonisolated static func readyToSave(_ draft: RecipeDraft) -> RecipeDraft? {
        guard draft.ingredients.contains(where: { !$0.name.trimmingCharacters(in: .whitespaces).isEmpty }) else { return nil }
        var draft = draft
        if draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { draft.title = "Untitled Recipe" }
        return draft
    }
}
