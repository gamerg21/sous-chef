import Foundation
import SwiftData

/// Used versus thrown away: what became of dated food as it ran out.
extension Kitchen {
    /// Notes an outcome for the Pantry's tally; it reaches the server on the next sync.
    func recordOutcome(_ kind: PantryOutcome.Kind, name: String, expiresOn: Date?, now: Date = .now) {
        context.insert(PantryOutcome(name: name, outcome: kind, on: DayFormat.string(now) ?? "", expiresOn: DayFormat.string(expiresOn)))
    }

    /// Applies `PantryOutcome.whenEmptied` when stock goes from `old` to
    /// nothing by hand: food before its date is counted as used. Returns false,
    /// recording nothing, when the food is past its date, so the caller can
    /// ask whether it was used or thrown away and then call `settle(_:as:)`.
    func countRunningOut(name: String, expiresOn: Date?, from old: Double, to new: Double, now: Date = .now) -> Bool {
        guard old > 0, new <= 0 else { return true }
        switch PantryOutcome.whenEmptied(expiresOn: expiresOn, now: now) {
        case .notCounted: return true
        case .used:
            recordOutcome(.used, name: name, expiresOn: expiresOn, now: now)
            return true
        case .ask: return false
        }
    }

    /// "Used" or "Thrown away" for an item past its date: counts it and keeps
    /// the item as Out (quantity 0), so its history and the shopping list keep
    /// working. An item that's already out isn't counted again.
    func settle(_ item: PantryItem, as kind: PantryOutcome.Kind, now: Date = .now) {
        guard item.quantity > 0 else { return }
        recordOutcome(kind, name: item.name, expiresOn: item.expiresOn, now: now)
        item.setQuantity(0)
        item.touch()
        changed()
    }

    /// Whether deleting `item` should first ask "Used" or "Thrown away": it's
    /// in stock and past its date. Answering settles it as Out instead of
    /// deleting it, as on the web; an item that's already out deletes as usual.
    func asksBeforeRemoving(_ item: PantryItem, now: Date = .now) -> Bool {
        item.quantity > 0 && PantryOutcome.whenEmptied(expiresOn: item.expiresOn, now: now) == .ask
    }

    /// This month's used and thrown-away counts.
    func outcomeTally(now: Date = .now) -> (used: Int, wasted: Int) {
        PantryOutcome.tally(fetch(PantryOutcome.self), month: PantryOutcome.month(of: now))
    }
}
