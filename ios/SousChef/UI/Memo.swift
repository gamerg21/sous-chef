import Foundation

/// Keeps a value derived in `body` until its key changes. Store it in
/// `@State`: it isn't observed, so refreshing it never triggers a redraw.
final class Memo<Key: Hashable, Value> {
    private var key: Key?
    private var value: Value?

    func callAsFunction(_ key: Key, _ make: () -> Value) -> Value {
        if let value, key == self.key { return value }
        let made = make()
        self.key = key
        value = made
        return made
    }
}

extension Kitchen {
    /// Changes whenever anything that readiness, ranking or recipe search
    /// depends on changes. Hashes the stored ingredient data itself, because
    /// server sync can replace ingredients without touching `updatedAt`.
    static func readinessKey(recipes: [Recipe], pantry: [PantryItem]) -> Int {
        var hasher = Hasher()
        for recipe in recipes {
            hasher.combine(recipe.uuid)
            hasher.combine(recipe.title)
            hasher.combine(recipe.tags)
            hasher.combine(recipe.favorited)
            hasher.combine(recipe.lastCookedAt)
            recipe.ingredientsJSON?.withUnsafeBytes { hasher.combine(bytes: $0) }
        }
        for item in pantry {
            hasher.combine(item.uuid)
            hasher.combine(item.name)
            hasher.combine(item.quantity)
            hasher.combine(item.unit)
            hasher.combine(item.expiresOn)
        }
        return hasher.finalize()
    }
}
