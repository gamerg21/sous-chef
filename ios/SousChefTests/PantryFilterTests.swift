import Foundation
import Testing
@testable import SousChef

/// The unfolded iPhone Duo held upright and open flat: one screen, with the
/// Pantry's glance strip filtering a list two items wide.
struct PantryFilterTests {
    private let now = Date()

    private func item(_ name: String, _ location: StorageLocation = .pantry, quantity: Double = 1, expiresInDays: Int? = nil) -> PantryItem {
        let item = PantryItem(name: name, location: location, quantity: quantity)
        item.expiresOn = expiresInDays.map { Calendar.current.date(byAdding: .day, value: $0, to: now)! }
        return item
    }

    @Test func companionStepsAsideOnlyUprightAndFlat() {
        // Upright: flat or closed steps aside; propped like a laptop splits.
        #expect(PaneLayout.stacked.companionStepsAside(in: .flat))
        #expect(!PaneLayout.stacked.companionStepsAside(in: .laptop))
        // Side by side and one column don't change.
        #expect(!PaneLayout.sideBySide.companionStepsAside(in: .flat))
        #expect(!PaneLayout.sideBySide.companionStepsAside(in: .book))
        #expect(!PaneLayout.single.companionStepsAside(in: .flat))
        #expect(!PaneLayout.single.companionStepsAside(in: .laptop))
    }

    @Test func tilesFilterOneAtATimeAndClearWhenTappedAgain() {
        var filter = PantryFilter()
        #expect(!filter.isFiltering && filter.title == nil)

        filter.toggle(.useSoon)
        #expect(filter.isOn(.useSoon) && filter.title == "what to use soon")

        // Another tile swaps it.
        filter.toggle(.location(.fridge))
        #expect(filter.isOn(.location(.fridge)) && !filter.isOn(.useSoon))
        #expect(filter.title == "Fridge" && filter.symbol == StorageLocation.fridge.symbol)

        filter.toggle(.useSoon)
        #expect(filter.useSoon && filter.scope == .all)

        // Tapped again, it clears.
        filter.toggle(.useSoon)
        #expect(!filter.isFiltering)
        filter.toggle(.location(.freezer))
        filter.toggle(.location(.freezer))
        #expect(!filter.isFiltering)

        // The search's scope bar picking a place turns "use soon" off too.
        filter.useSoon = true
        filter.scope = .location(.pantry)
        #expect(!filter.useSoon && filter.location == .pantry)
    }

    @Test func matchesLocationAndSearchAndFindsWhatToUseSoon() {
        let items = [
            item("Milk", .fridge, expiresInDays: 1),
            item("Yogurt", .fridge, expiresInDays: 10),
            item("Old cream", .fridge, quantity: 0, expiresInDays: -1),
            item("Peas", .freezer, expiresInDays: 2),
            item("Rice", .pantry),
        ]
        var filter = PantryFilter()
        #expect(filter.matching(items, search: "").count == 5)
        #expect(filter.matching(items, search: "ri").map(\.name) == ["Rice"])
        filter.scope = .location(.fridge)
        #expect(filter.matching(items, search: "").map(\.name) == ["Milk", "Yogurt", "Old cream"])

        // In stock, within the window, soonest first; nothing in the pantry.
        #expect(PantryFilter.expiring(in: items, within: 3, now: now).map(\.name) == ["Milk", "Peas"])
        #expect(PantryFilter.expiring(in: [items[4]], within: 3, now: now).isEmpty)
    }

    @Test func freshShareCountsDatedStockPastTheWindow() {
        let items = [
            item("Milk", expiresInDays: 1),
            item("Yogurt", expiresInDays: 10),
            item("Cheese", expiresInDays: 20),
            item("Cream", expiresInDays: -2),
            item("Rice"),
            item("Gone", quantity: 0, expiresInDays: 30),
        ]
        // Two of four dated items in stock are fresh.
        #expect(PantryInsightsPane.freshShare(of: items, window: 3, now: now) == 50)
        #expect(PantryInsightsPane.freshShare(of: [item("Rice")], window: 3, now: now) == nil)
    }

    @Test func fitsTwoColumnsUntilTheTextGetsLarge() {
        // The upright Duo's list, less its margins, at the default size and larger.
        #expect(ColumnFit.count(width: 629, minimumWidth: 250, maximum: 2) == 2)
        #expect(ColumnFit.count(width: 629, minimumWidth: 250 * 1.35, maximum: 2) == 1)
        #expect(ColumnFit.count(width: 400, minimumWidth: 120, spacing: 10, maximum: 4) == 3)
        #expect(ColumnFit.count(width: 100, minimumWidth: 250, maximum: 2) == 1)
        #expect(ColumnFit.count(width: 1000, minimumWidth: 0, maximum: 2) == 1)
    }

    @Test func laysItemsOutInRows() {
        #expect([1, 2, 3, 4, 5].rows(of: 2) == [[1, 2], [3, 4], [5]])
        #expect([1, 2].rows(of: 1) == [[1], [2]])
        #expect([Int]().rows(of: 2).isEmpty)
        #expect([1, 2].rows(of: 0) == [[1], [2]])
    }
}
