import Foundation
import Testing
import UserNotifications
@testable import SousChef

/// Cook timer Live Activity state, timer notifications, the widgets'
/// kitchen snapshot, and widget deep links.
@MainActor
struct WidgetTests {
    private let now = Date(timeIntervalSinceReferenceDate: 800_000_000)

    private func timer(_ label: String, seconds: Int, startedSecondsAgo: Int = 0) -> CookTimer {
        CookTimer(label: label, seconds: seconds, started: now.addingTimeInterval(-TimeInterval(startedSecondsAgo)))
    }

    // MARK: Cook timers

    @Test func activityListsRunningTimersSoonestFirstThenFinishedOnes() {
        let long = timer("Step 4", seconds: 1200)
        let short = timer("Step 2", seconds: 300)
        let doneEarlier = timer("Step 1", seconds: 60, startedSecondsAgo: 600)
        let doneLater = timer("Step 3", seconds: 120, startedSecondsAgo: 130)

        let state = CookTimerAlerts.contentState(for: [long, doneEarlier, short, doneLater], now: now)

        #expect(state.timers.map(\.label) == ["Step 2", "Step 4", "Step 3", "Step 1"])
        #expect(state.next?.id == short.id)
        #expect(state.timers[0].startedAt == short.started)
        #expect(state.timers[0].endsAt == short.started.addingTimeInterval(300))
        #expect(state.timers[0].interval == short.started...short.started.addingTimeInterval(300))
    }

    @Test func activityGoesStaleWhenTheNextTimerFinishes() {
        let state = CookTimerAlerts.contentState(for: [timer("Step 2", seconds: 300), timer("Step 5", seconds: 900)], now: now)
        #expect(CookTimerAlerts.staleDate(for: state, now: now) == now.addingTimeInterval(300))

        let finished = CookTimerAlerts.contentState(for: [timer("Step 1", seconds: 60, startedSecondsAgo: 90)], now: now)
        #expect(CookTimerAlerts.staleDate(for: finished, now: now) == nil)
        #expect(finished.next?.isDone(at: now) == true)
    }

    @Test func noTimersMeansAnEmptyActivity() {
        let state = CookTimerAlerts.contentState(for: [], now: now)
        #expect(state.timers.isEmpty)
        #expect(state.next == nil)
    }

    @Test func timerNotificationsUseTheirOwnIdentifiersAndPlayASound() throws {
        let cookTimer = timer("Step 3", seconds: 600)
        let request = CookTimerAlerts.request(for: cookTimer, recipeTitle: "Pesto Pasta", in: 600)

        #expect(request.identifier == "souschef.cook-timer.\(cookTimer.id.uuidString)")
        #expect(request.content.title == "Step 3 timer is done")
        #expect(request.content.body == "Pesto Pasta")
        #expect(request.content.sound != nil)
        #expect(request.content.categoryIdentifier == CookTimerAlerts.notificationCategory)
        let trigger = try #require(request.trigger as? UNTimeIntervalNotificationTrigger)
        #expect(trigger.timeInterval == 600)
        #expect(!trigger.repeats)
    }

    // MARK: Snapshot

    @Test func snapshotRoundTripsThroughJSON() throws {
        let snapshot = KitchenSnapshot(
            expiring: [.init(id: UUID(), name: "Spinach", location: "fridge", expiresOn: Date(timeIntervalSince1970: 1_790_000_000))],
            shopping: .init(openCount: 3, names: ["Milk", "Eggs", "Bread"]))

        let data = try snapshot.encoded()
        #expect(try KitchenSnapshot.decode(data) == snapshot)

        // Dates are readable ISO 8601 strings, so the file is easy to inspect.
        let json = try #require(String(data: data, encoding: .utf8))
        #expect(json.contains("\"expiresOn\":\"2026-09-21T"))
        #expect(json.contains("\"openCount\":3"))
    }

    @Test func snapshotDecodesWhenNewSectionsAreAddedOrMissing() throws {
        // A snapshot from a newer build (say, with tonight's meal) still decodes.
        let newer = #"{"expiring":[],"shopping":{"names":["Milk"],"openCount":1},"tonight":{"title":"Soup"}}"#
        #expect(try KitchenSnapshot.decode(Data(newer.utf8)).shopping.names == ["Milk"])
    }

    @Test func snapshotListsFoodExpiringSoonAndTheOpenShoppingList() throws {
        let kitchen = Kitchen(inMemory: true)
        func pantry(_ name: String, days: Int?, quantity: Double = 1, location: StorageLocation = .fridge) {
            let item = PantryItem(name: name, location: location, quantity: quantity)
            item.expiresOn = days.map { Calendar.current.date(byAdding: .day, value: $0, to: now)! }
            kitchen.context.insert(item)
        }
        pantry("Yogurt", days: 2)
        pantry("Spinach", days: 0)
        pantry("Old milk", days: -1)
        pantry("Rice", days: nil, location: .pantry)
        pantry("Frozen peas", days: 60, location: .freezer)
        pantry("Used-up cream", days: 1, quantity: 0)
        kitchen.addShopping("Eggs")
        kitchen.addShopping("Bread")
        kitchen.addShopping("Lemons")
        let bread = try #require(kitchen.fetch(ShoppingItem.self).first { $0.name == "Bread" })
        bread.checked = true

        let snapshot = WidgetSnapshotWriter.snapshot(of: kitchen, now: now)

        #expect(snapshot.expiring.map(\.name) == ["Old milk", "Spinach", "Yogurt"])
        #expect(snapshot.expiring.map { $0.days(from: now) } == [-1, 0, 2])
        #expect(snapshot.expiring[0].location == "fridge")
        #expect(snapshot.shopping.openCount == 2)
        #expect(Set(snapshot.shopping.names) == ["Eggs", "Lemons"])
    }

    @Test func snapshotKeepsOnlyTheFirstFewItems() {
        let kitchen = Kitchen(inMemory: true)
        for index in 0..<12 {
            let item = PantryItem(name: "Food \(index)")
            item.expiresOn = Calendar.current.date(byAdding: .day, value: index, to: now)
            kitchen.context.insert(item)
            kitchen.context.insert(ShoppingItem(name: "Item \(index)"))
        }
        let snapshot = WidgetSnapshotWriter.snapshot(of: kitchen, now: now)
        #expect(snapshot.expiring.count == KitchenSnapshot.expiringLimit)
        #expect(snapshot.shopping.openCount == 12)
        #expect(snapshot.shopping.names.count == KitchenSnapshot.shoppingNameLimit)
    }

    @Test func expiringItemsDescribeDaysLeft() {
        func item(_ days: Int) -> KitchenSnapshot.ExpiringItem {
            .init(id: UUID(), name: "Milk", location: "fridge", expiresOn: Calendar.current.date(byAdding: .day, value: days, to: now)!)
        }
        #expect(item(-2).dayText(from: now) == "Expired")
        #expect(item(0).dayText(from: now) == "Today")
        #expect(item(1).dayText(from: now) == "Tomorrow")
        #expect(item(4).dayText(from: now) == "4 days")
    }

    // MARK: Deep links

    @Test func widgetLinksOpenTheirTab() {
        let navigator = AppNavigator()
        navigator.open(KitchenLink.shopping)
        #expect(navigator.tab == .shopping)
        navigator.open(KitchenLink.pantry)
        #expect(navigator.tab == .pantry)

        // The share extension's link and other schemes leave the tab alone.
        navigator.open(URL(string: "souschef://shared")!)
        navigator.open(URL(string: "https://example.com/shopping")!)
        #expect(navigator.tab == .pantry)
    }
}
