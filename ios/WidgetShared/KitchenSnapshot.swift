import Foundation

/// A small, read-only picture of the kitchen for the widgets. The app writes
/// it to the App Group whenever the pantry, shopping list or meal plan changes
/// and when it goes to the background; widgets only read it, so they never
/// open the iCloud-synced SwiftData store. Compiled into the app and the
/// widget extension.
///
/// To add a section, add an optional property here, decode it in
/// `init(from:)`, fill it in `WidgetSnapshotWriter.snapshot(of:)`, and give
/// the widget bundle a widget that reads it. Optional sections decode as nil
/// from snapshots written by older builds (or when unreadable), so no
/// migration is needed.
nonisolated struct KitchenSnapshot: Codable, Hashable, Sendable {
    /// Food on hand expiring within the cook's window (or already expired),
    /// soonest first.
    var expiring: [ExpiringItem] = []
    var shopping = ShoppingSummary()
    /// The "expiring soon" window `expiring` was found with, in days.
    var expiringWindowDays: Int? = nil
    /// Today's meal to cook next; nil when nothing uncooked is planned today.
    var tonight: Meal? = nil
    /// Tomorrow's, so the widget moves on at midnight before the app runs again.
    var tomorrow: Meal? = nil

    init(expiring: [ExpiringItem] = [], shopping: ShoppingSummary = ShoppingSummary(), expiringWindowDays: Int? = nil, tonight: Meal? = nil, tomorrow: Meal? = nil) {
        self.expiring = expiring
        self.shopping = shopping
        self.expiringWindowDays = expiringWindowDays
        self.tonight = tonight
        self.tomorrow = tomorrow
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        expiring = try container.decode([ExpiringItem].self, forKey: .expiring)
        shopping = try container.decode(ShoppingSummary.self, forKey: .shopping)
        // Newer sections are optional: a missing or unreadable one is nil
        // rather than losing the whole snapshot.
        expiringWindowDays = try? container.decodeIfPresent(Int.self, forKey: .expiringWindowDays)
        tonight = try? container.decodeIfPresent(Meal.self, forKey: .tonight)
        tomorrow = try? container.decodeIfPresent(Meal.self, forKey: .tomorrow)
    }

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

    /// A planned meal: what's cooking, for which meal, and whether the pantry
    /// has what it needs.
    struct Meal: Codable, Hashable, Sendable, Identifiable {
        /// The planned meal's ID.
        var id: UUID
        var recipeID: UUID?
        var recipeName: String
        /// The plan's day key, "YYYY-MM-DD" in the person's time zone.
        var day: String
        /// `MealSlot` raw value: breakfast, lunch, dinner or snack.
        var slot: String
        var servings: Int?
        /// Ingredients the pantry is short of, at the planned servings.
        var missing: Int
        /// A small JPEG of the recipe photo in the App Group, if it has one.
        var photo: String?

        /// "Ready" or "Missing 2".
        var readiness: String { missing == 0 ? "Ready" : "Missing \(missing)" }

        var slotTitle: String { slot.prefix(1).uppercased() + slot.dropFirst() }

        /// Mirrors `MealSlot.symbol` in the app.
        var slotSymbol: String {
            switch slot {
            case "breakfast": "sunrise"
            case "lunch": "sun.max"
            case "snack": "carrot"
            default: "moon.stars"
            }
        }
    }

    /// The meal to show at `date`: tonight's on the day it was written for,
    /// tomorrow's once the day has turned, and nothing after that.
    func meal(at date: Date, calendar: Calendar = .current) -> Meal? {
        let day = Self.dayKey(date, calendar: calendar)
        if let tonight, tonight.day == day { return tonight }
        if let tomorrow, tomorrow.day == day { return tomorrow }
        return nil
    }

    /// A day key ("YYYY-MM-DD") in the person's time zone, as meal plans use.
    static func dayKey(_ date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// How many items of each list the app keeps; widgets show fewer.
    static let expiringLimit = 8
    static let shoppingNameLimit = 6

    static let empty = KitchenSnapshot()

    // MARK: Storage

    static let fileName = "KitchenSnapshot.json"
    /// Where meal photo thumbnails live in the App Group.
    static let photoDirectoryName = "WidgetPhotos"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: SharedRecipeInbox.appGroup)
    }

    static var fileURL: URL? { containerURL?.appending(path: fileName) }

    static var photoDirectory: URL? { containerURL?.appending(path: photoDirectoryName, directoryHint: .isDirectory) }

    static func photoURL(named name: String) -> URL? { photoDirectory?.appending(path: name) }

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

/// `souschef://` links used by widgets and notifications. The share
/// extension's `souschef://shared` is handled separately.
nonisolated enum KitchenLink {
    /// Everywhere a link can lead.
    enum Destination: Hashable, Sendable {
        case pantry, recipes, cook, shopping, community
        /// The Pantry's "Use soon" section.
        case useSoon
        /// Cook, showing recipes that use up food expiring soon.
        case useItUp
        /// The week's meal plan, inside Cook.
        case plan
        /// A saved recipe.
        case recipe(UUID)
    }

    static let pantry = URL(string: "souschef://pantry")!
    static let shopping = URL(string: "souschef://shopping")!
    static let cook = URL(string: "souschef://cook")!
    static let plan = URL(string: "souschef://plan")!
    static let useSoon = URL(string: "souschef://pantry/use-soon")!
    static let useItUp = URL(string: "souschef://cook/use-it-up")!

    static func recipe(_ id: UUID) -> URL { URL(string: "souschef://recipe/" + id.uuidString)! }

    /// Where a link leads, or nil for other schemes and unknown links.
    static func destination(of url: URL) -> Destination? {
        guard url.scheme?.lowercased() == "souschef", let host = url.host()?.lowercased() else { return nil }
        let first = url.pathComponents.first { $0 != "/" }
        switch (host, first?.lowercased()) {
        case ("pantry", "use-soon"): return .useSoon
        case ("cook", "use-it-up"): return .useItUp
        case ("pantry", _): return .pantry
        case ("recipes", _): return .recipes
        case ("cook", _): return .cook
        case ("shopping", _): return .shopping
        case ("community", _): return .community
        case ("plan", _): return .plan
        case ("recipe", _): return first.flatMap(UUID.init(uuidString:)).map(Destination.recipe)
        default: return nil
        }
    }
}
