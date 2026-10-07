import Foundation
import SwiftData

/// What became of a pantry item as it ran out: used up, or thrown away. Feeds
/// the Pantry's "This month" tally, like `pantryOutcomes` on the server.
///
/// Follows CloudKit's rules like the other models. `uuid` doubles as the
/// server's `clientId`, so pushing an outcome twice doesn't count it twice.
@Model
final class PantryOutcome {
    nonisolated enum Kind: String, Codable, CaseIterable {
        case used, wasted
    }

    var uuid: UUID = UUID()
    var name: String = ""
    var outcomeRaw: String = Kind.used.rawValue
    /// The person's local day it happened, "YYYY-MM-DD", the same key the server uses.
    var on: String = ""
    /// The item's date, "YYYY-MM-DD", when it had one.
    var expiresOn: String?
    var createdAt: Date = Date()
    var serverID: String?
    var needsPush: Bool = true

    init(name: String, outcome: Kind, on: String, expiresOn: String? = nil) {
        self.name = name
        self.outcomeRaw = outcome.rawValue
        self.on = on
        self.expiresOn = expiresOn
    }

    var outcome: Kind { Kind(rawValue: outcomeRaw) ?? .used }
}

extension PantryOutcome {
    nonisolated enum WhenEmptied: Equatable {
        /// No date, so there's nothing to count.
        case notCounted
        /// Before or on its date: counted as used without asking.
        case used
        /// Past its date: ask whether it was used or thrown away.
        case ask
    }

    /// The one rule for an item run down to nothing by hand (the pantry's
    /// "Use" action, the item editor, or Siri's "I ran out"). Cooking always
    /// counts a dated item as used, here and on the server.
    nonisolated static func whenEmptied(expiresOn: Date?, now: Date = .now, calendar: Calendar = .current) -> WhenEmptied {
        guard let expiresOn else { return .notCounted }
        return ExpiringFood.daysLeft(until: expiresOn, from: now, calendar: calendar) < 0 ? .ask : .used
    }

    /// Used and thrown-away counts for a month ("YYYY-MM"). The same outcome
    /// can briefly exist twice, from iCloud and from the server, so each
    /// counts once by its ID or server ID.
    static func tally(_ outcomes: [PantryOutcome], month: String) -> (used: Int, wasted: Int) {
        var ids = Set<UUID>(), serverIDs = Set<String>()
        var used = 0, wasted = 0
        for outcome in outcomes where outcome.on.hasPrefix(month) {
            guard ids.insert(outcome.uuid).inserted else { continue }
            if let id = outcome.serverID, !serverIDs.insert(id).inserted { continue }
            if outcome.outcome == .used { used += 1 } else { wasted += 1 }
        }
        return (used, wasted)
    }

    /// "YYYY-MM" for the month containing `date`, in the device's time zone.
    static func month(of date: Date = .now, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0)
    }
}
