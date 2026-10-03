import Foundation

/// A pantry item that expires within the cook's window, or already has.
///
/// Foundation only, so the app, its extensions and a widget can share the
/// rules without SwiftData. Mirrors `src/lib/expiring.ts` on the web: days are
/// calendar days in the device's time zone, and only items in stock count.
nonisolated struct ExpiringFood: Hashable, Sendable, Identifiable {
    /// What the rules need from a pantry item.
    struct Stock: Hashable, Sendable {
        var id: UUID
        var name: String
        var quantity: Double
        var expiresOn: Date?
    }

    var id: UUID
    var name: String
    var expiresOn: Date
    /// Negative once the date has passed; 0 means it expires today.
    var daysLeft: Int

    // MARK: Window

    static let defaultWindowDays = 3
    static let windowChoices = [1, 2, 3, 5, 7]
    static let windowDaysKey = "expiry.windowDays"

    /// Where the window is stored: the App Group when the build has one, so a
    /// widget reads the same setting, otherwise the app's own defaults.
    static var settings: UserDefaults {
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedRecipeInbox.appGroup) != nil,
              let group = UserDefaults(suiteName: SharedRecipeInbox.appGroup) else { return .standard }
        return group
    }

    /// The cook's "expiring soon" window in days.
    static var windowDays: Int {
        let stored = settings.integer(forKey: windowDaysKey)
        return (1...30).contains(stored) ? stored : defaultWindowDays
    }

    // MARK: Finding

    static func daysLeft(until date: Date, from now: Date, calendar: Calendar = .current) -> Int {
        calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: date)).day ?? 0
    }

    /// Items in stock expiring within `days` of `now`, including anything
    /// already past its date. Soonest first, then by name.
    static func find(in stock: [Stock], within days: Int = windowDays, now: Date = .now, calendar: Calendar = .current) -> [ExpiringFood] {
        stock.compactMap { item -> ExpiringFood? in
            guard item.quantity > 0, let date = item.expiresOn else { return nil }
            let left = daysLeft(until: date, from: now, calendar: calendar)
            return left <= days ? ExpiringFood(id: item.id, name: item.name, expiresOn: date, daysLeft: left) : nil
        }
        .sorted { $0.daysLeft != $1.daysLeft ? $0.daysLeft < $1.daysLeft : $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    // MARK: Wording

    /// "expires today", "expire in 2 days", "expired yesterday"…
    static func phrase(daysLeft: Int, plural: Bool = false) -> String {
        let verb = plural ? "expire" : "expires"
        switch daysLeft {
        case ..<(-1): return "expired \(-daysLeft) days ago"
        case -1: return "expired yesterday"
        case 0: return "\(verb) today"
        case 1: return "\(verb) tomorrow"
        default: return "\(verb) in \(daysLeft) days"
        }
    }

    /// "Milk and spinach expire in 2 days", or with mixed dates "Yogurt
    /// expired yesterday; Milk expires tomorrow (+2 more)". Empty when
    /// nothing is expiring.
    static func summary(_ items: [ExpiringFood], limit: Int = 3) -> String {
        let sorted = items.sorted { $0.daysLeft < $1.daysLeft }
        var groups: [(daysLeft: Int, names: [String])] = []
        for item in sorted.prefix(limit) {
            if groups.last?.daysLeft == item.daysLeft { groups[groups.count - 1].names.append(item.name) }
            else { groups.append((item.daysLeft, [item.name])) }
        }
        var text = groups
            .map { ListFormatter.localizedString(byJoining: $0.names) + " " + phrase(daysLeft: $0.daysLeft, plural: $0.names.count > 1) }
            .joined(separator: "; ")
        if sorted.count > limit { text += " (+\(sorted.count - limit) more)" }
        return text.prefix(1).uppercased() + text.dropFirst()
    }
}
