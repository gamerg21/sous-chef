import Foundation

/// A small, read-only picture of the kitchen for the widgets. The app writes
/// it to the App Group whenever the pantry or shopping list changes and when
/// it goes to the background; widgets only read it, so they never open the
/// iCloud-synced SwiftData store. Compiled into the app and the widget
/// extension.
///
/// To add a section (such as tonight's planned meal), add an optional
/// property here, fill it in `WidgetSnapshotWriter.snapshot(of:)`, and give
/// the widget bundle a widget that reads it. Optional properties decode as
/// nil from snapshots written by older builds, so no migration is needed.
nonisolated struct KitchenSnapshot: Codable, Hashable, Sendable {
    /// Food on hand that has an expiry date, soonest first.
    var expiring: [ExpiringItem] = []
    var shopping = ShoppingSummary()
    // var tonight: PlannedMeal?  ← meal planning plugs in here.

    struct ExpiringItem: Codable, Hashable, Sendable, Identifiable {
        var id: UUID
        var name: String
        /// `StorageLocation` raw value: pantry, fridge or freezer.
        var location: String
        var expiresOn: Date

        /// Whole days from the start of `date`'s day to the expiry day;
        /// negative once it has expired.
        func days(from date: Date, calendar: Calendar = .current) -> Int {
            calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: expiresOn)).day ?? 0
        }

        /// "Expired", "Today", "Tomorrow", "3 days", as the widgets show it.
        func dayText(from date: Date, calendar: Calendar = .current) -> String {
            switch days(from: date, calendar: calendar) {
            case ..<0: "Expired"
            case 0: "Today"
            case 1: "Tomorrow"
            case let days: "\(days) days"
            }
        }
    }

    struct ShoppingSummary: Codable, Hashable, Sendable {
        /// Items not yet checked off.
        var openCount = 0
        /// The first few open items, oldest first.
        var names: [String] = []
    }

    /// How many items of each list the app keeps; widgets show fewer.
    static let expiringLimit = 8
    static let shoppingNameLimit = 6
    /// Items further out than this aren't "expiring soon".
    static let expiringHorizonDays = 14

    static let empty = KitchenSnapshot()

    // MARK: Storage

    static let fileName = "KitchenSnapshot.json"

    static var fileURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedRecipeInbox.appGroup)?
            .appending(path: fileName)
    }

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = .sortedKeys
        return encoder
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    func encoded() throws -> Data { try Self.encoder.encode(self) }

    static func decode(_ data: Data) throws -> KitchenSnapshot { try decoder.decode(KitchenSnapshot.self, from: data) }

    /// The last snapshot the app wrote, or nil before the first one (or
    /// without the App Group).
    static func load() -> KitchenSnapshot? {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? decode(data)
    }
}

/// `souschef://` links that open a tab, used by widget taps. The share
/// extension's `souschef://shared` keeps working alongside them.
nonisolated enum KitchenLink {
    static let pantry = URL(string: "souschef://pantry")!
    static let shopping = URL(string: "souschef://shopping")!
    static let cook = URL(string: "souschef://cook")!

    /// The tab name in a link, such as "shopping".
    static func tabName(in url: URL) -> String? {
        guard url.scheme?.lowercased() == "souschef" else { return nil }
        return url.host()?.lowercased()
    }
}
