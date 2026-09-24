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
        let limit = Calendar.current.date(byAdding: .day, value: days + 1, to: Calendar.current.startOfDay(for: now)) ?? now
        return onHand().filter { ($0.expiresOn ?? .distantFuture) < limit }
    }

    struct RecipeSuggestion {
        var recipe: Recipe
        var plan: CookingPlan
        /// Ingredients that draw on items expiring within three days.
        var usesExpiring: Int
    }

    /// Saved recipes ranked by how well the pantry covers them: nothing
    /// missing first, then recipes that use up food about to expire, then
    /// favorites, then whatever hasn't been cooked in a while.
    func suggestRecipes(limit: Int = 3, now: Date = Date()) -> [RecipeSuggestion] {
        let stock = stock()
        let expiring = Set(expiringSoon(now: now).map { normalizeName($0.name) })
        let suggestions = fetch(Recipe.self)
            .filter { !$0.ingredients.isEmpty }
            .map { recipe in
                RecipeSuggestion(recipe: recipe, plan: CookingPlanner.plan(ingredients: recipe.ingredients, stock: stock),
                                 usesExpiring: recipe.ingredients.filter { expiring.contains(normalizeName($0.pantryName)) }.count)
            }
            .filter { $0.plan.availableCount > 0 }
        return suggestions.sorted { a, b in
            if a.plan.missingIngredients.count != b.plan.missingIngredients.count {
                return a.plan.missingIngredients.count < b.plan.missingIngredients.count
            }
            if a.usesExpiring != b.usesExpiring { return a.usesExpiring > b.usesExpiring }
            if a.recipe.favorited != b.recipe.favorited { return a.recipe.favorited }
            return (a.recipe.lastCookedAt ?? .distantPast) < (b.recipe.lastCookedAt ?? .distantPast)
        }
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
}
