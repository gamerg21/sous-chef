import Foundation

/// Recipes shared to Sous Chef from other apps. The share extension adds
/// them to an App Group; the app takes them the next time it becomes active
/// and runs each through the usual import and review. Compiled into both the
/// app and the extension.
nonisolated enum SharedRecipeInbox {
    enum Item: Codable, Hashable {
        case link(URL)
        case text(String)
    }

    static let appGroup = "group.com.georgevina.souschef"
    private static let key = "sharedRecipes"

    /// Nil when the App Group isn't available, such as a build signed
    /// without it; writing to `UserDefaults(suiteName:)` would then succeed
    /// but never reach the app.
    private static var defaults: UserDefaults? {
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil else { return nil }
        return UserDefaults(suiteName: appGroup)
    }

    /// What a share should import: the link when there is one, or text that
    /// is really just a link ("Million Dollar Soup https://…"), otherwise the
    /// text itself as a recipe.
    static func item(url: URL?, text: String?) -> Item? {
        if let url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") { return .link(url) }
        guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        if let link = link(in: text) { return .link(link) }
        return .text(text)
    }

    /// The link in text that is just a link, perhaps with the page title.
    /// Recipe text that merely cites its source stays text.
    static func link(in text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.components(separatedBy: .newlines).count <= 2,
              let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        let links = detector.matches(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed))
            .compactMap(\.url)
            .filter { ["http", "https"].contains($0.scheme?.lowercased() ?? "") }
        return links.count == 1 ? links[0] : nil
    }

    /// Queues an item for the app. Returns false when it couldn't be handed over.
    @discardableResult
    static func add(_ item: Item) -> Bool {
        guard let defaults else { return false }
        var items = pending(in: defaults)
        if !items.contains(item) { items.append(item) }
        guard let data = try? JSONEncoder().encode(items) else { return false }
        defaults.set(data, forKey: key)
        return true
    }

    /// Everything shared since the app last looked, oldest first, and empties the inbox.
    static func take() -> [Item] {
        guard let defaults else { return [] }
        let items = pending(in: defaults)
        defaults.removeObject(forKey: key)
        return items
    }

    private static func pending(in defaults: UserDefaults) -> [Item] {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode([Item].self, from: $0) } ?? []
    }
}
