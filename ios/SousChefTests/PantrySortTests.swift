import Foundation
import Testing
@testable import SousChef

/// The Pantry's sort menu: name, expiring soonest and recently added.
struct PantrySortTests {
    private let now = Date()

    private func item(_ name: String, _ quantity: Double = 1, expiresInDays: Int? = nil, addedDaysAgo: Int = 0) -> PantryItem {
        let item = PantryItem(name: name, quantity: quantity)
        item.expiresOn = expiresInDays.map { Calendar.current.date(byAdding: .day, value: $0, to: now)! }
        item.createdAt = Calendar.current.date(byAdding: .day, value: -addedDaysAgo, to: now)!
        return item
    }

    @Test func nameSortIsAlphabeticalAndIgnoresCase() {
        let items = [item("rice"), item("Apples"), item("item 10"), item("item 2")]
        #expect(PantrySort.name.sorted(items).map(\.name) == ["Apples", "item 2", "item 10", "rice"])
    }

    @Test func expiringSortPutsSoonestFirstAndUndatedOrOutLast() {
        let items = [
            item("Rice"),
            item("Yogurt", expiresInDays: 5),
            item("Milk", expiresInDays: 1),
            item("Cream", 0, expiresInDays: -2),
            item("Bread", expiresInDays: 1),
        ]
        #expect(PantrySort.expiring.sorted(items).map(\.name) == ["Bread", "Milk", "Yogurt", "Cream", "Rice"])
    }

    @Test func recentSortPutsNewestFirst() {
        let items = [item("Old", addedDaysAgo: 10), item("New", addedDaysAgo: 0), item("Middle", addedDaysAgo: 3)]
        #expect(PantrySort.recent.sorted(items).map(\.name) == ["New", "Middle", "Old"])
    }
}
