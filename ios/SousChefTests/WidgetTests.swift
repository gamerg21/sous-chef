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

    @Test func timerNotificationsAreTimeSensitiveOnlyWithoutAnAlarm() {
        let cookTimer = timer("Step 3", seconds: 600)
        #expect(CookTimerAlerts.request(for: cookTimer, recipeTitle: "Pesto Pasta", in: 600).content.interruptionLevel == .timeSensitive)
        #expect(CookTimerAlerts.request(for: cookTimer, recipeTitle: "Pesto Pasta", in: 600, hasAlarm: true).content.interruptionLevel == .active)
    }

    @Test func refreshingMovesFinishedTimersBehindRunningOnes() {
        let first = timer("Step 2", seconds: 300)
        let second = timer("Step 5", seconds: 900)
        let third = timer("Step 7", seconds: 1800)
        let state = CookTimerAlerts.contentState(for: [first, second, third], now: now)

        // Ten minutes on: Step 2 has finished; Step 5 is next.
        let later = now.addingTimeInterval(600)
        let refreshed = CookTimerAlerts.refreshed(state, now: later)
        #expect(refreshed.timers.map(\.label) == ["Step 5", "Step 7", "Step 2"])
        #expect(CookTimerAlerts.staleDate(for: refreshed, now: later) == now.addingTimeInterval(900))

        // Everything finished: most recent first, nothing left to go stale.
        let done = CookTimerAlerts.refreshed(state, now: now.addingTimeInterval(3600))
        #expect(done.timers.map(\.label) == ["Step 7", "Step 5", "Step 2"])
        #expect(CookTimerAlerts.staleDate(for: done, now: now.addingTimeInterval(3600)) == nil)
    }

    @Test func staleActivityTreatsOnlyItsNextTimerAsDone() throws {
        let state = CookTimerAlerts.contentState(for: [timer("Step 2", seconds: 300), timer("Step 5", seconds: 900)], now: now)
        let next = try #require(state.next)
        let other = state.timers[1]
        // Rendered a moment before the stale date.
        let early = now.addingTimeInterval(299)
        #expect(!state.isDone(next, at: early, isStale: false))
        #expect(state.isDone(next, at: early, isStale: true))
        #expect(!state.isDone(other, at: early, isStale: true))
        #expect(state.isDone(other, at: now.addingTimeInterval(900), isStale: false))
    }

    @Test(arguments: [(1, 0, 0), (3, 2, 0), (4, 1, 2), (6, 1, 4)])
    func lockScreenListsWhatFitsThenHowManyMore(count: Int, shown: Int, hidden: Int) {
        // The last timer has finished; it still counts toward "+N more".
        var timers = (1..<count).map { timer("Step \($0)", seconds: 300 * $0) }
        timers.append(timer("Step \(count)", seconds: 60, startedSecondsAgo: 120))
        let state = CookTimerAlerts.contentState(for: timers, now: now)

        let others = state.others(rows: 2)
        #expect(others.shown.count == shown)
        #expect(others.hidden == hidden)
        #expect(others.shown.map(\.id) == Array(state.timers.dropFirst().prefix(shown)).map(\.id))
    }

    @Test func smallerRowsShowHoursAndMinutesForLongTimers() {
        let enUS = Locale(identifier: "en_US")
        func countdown(_ seconds: TimeInterval) -> CookTimerAttributes.Countdown {
            .init(id: UUID(), label: "Step 1", startedAt: now, endsAt: now.addingTimeInterval(seconds))
        }
        func short(_ seconds: Int) -> String {
            CookTimerAttributes.Countdown.shortFormat.locale(enUS).format(.seconds(seconds))
        }
        #expect(countdown(2 * 3600 + 59 * 60 + 11).usesShortFormat(at: now))
        #expect(short(2 * 3600 + 59 * 60 + 11) == "2h 59m")
        // Rounded down, like a countdown, not up to "3h".
        #expect(short(2 * 3600 + 59 * 60 + 59) == "2h 59m")
        #expect(short(3600) == "1h")

        // Under an hour the rows keep the clock, which is narrower.
        #expect(!countdown(59 * 60 + 11).usesShortFormat(at: now))
        #expect(!countdown(45).usesShortFormat(at: now))
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
        // A snapshot from a newer build (an unknown section, or tonight's meal
        // in a shape this build can't read) still decodes; the unreadable
        // section is just missing.
        let newer = #"{"expiring":[],"shopping":{"names":["Milk"],"openCount":1},"lunchbox":[1],"tonight":{"title":"Soup"}}"#
        let snapshot = try KitchenSnapshot.decode(Data(newer.utf8))
        #expect(snapshot.shopping.names == ["Milk"])
        #expect(snapshot.tonight == nil)
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

        let snapshot = WidgetSnapshotWriter.snapshot(of: kitchen, now: now, window: 3)

        #expect(snapshot.expiring.map(\.name) == ["Old milk", "Spinach", "Yogurt"])
        #expect(snapshot.expiringWindowDays == 3)
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
        let snapshot = WidgetSnapshotWriter.snapshot(of: kitchen, now: now, window: 14)
        #expect(snapshot.expiring.count == KitchenSnapshot.expiringLimit)
        #expect(snapshot.shopping.openCount == 12)
        #expect(snapshot.shopping.names.count == KitchenSnapshot.shoppingNameLimit)
    }

    @Test func snapshotUsesTheSameExpiringWindowAsThePantry() {
        let kitchen = Kitchen(inMemory: true)
        for days in [-3, 0, 2, 3, 4, 10] {
            let item = PantryItem(name: "Food \(days)")
            item.expiresOn = Calendar.current.date(byAdding: .day, value: days, to: now)
            kitchen.context.insert(item)
        }
        let stock = kitchen.onHand().map(\.expiringStock)
        for window in [1, 3, 7] {
            let snapshot = WidgetSnapshotWriter.snapshot(of: kitchen, now: now, window: window)
            #expect(snapshot.expiring.map(\.id) == ExpiringFood.find(in: stock, within: window, now: now).map(\.id))
        }
        let names = WidgetSnapshotWriter.snapshot(of: kitchen, now: now, window: 3).expiring.map(\.name)
        #expect(names == ["Food -3", "Food 0", "Food 2", "Food 3"])
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

    @Test func linksLeadToUseSoonUseItUpThePlanAndRecipes() throws {
        let navigator = AppNavigator()
        navigator.open(KitchenLink.useItUp)
        #expect(navigator.tab == .cook && navigator.cookShowsExpiring)

        navigator.open(KitchenLink.useSoon)
        #expect(navigator.tab == .pantry && navigator.revealExpiringInPantry)

        navigator.open(KitchenLink.plan)
        #expect(navigator.tab == .cook && navigator.showPlan)

        let id = UUID()
        navigator.open(KitchenLink.recipe(id))
        #expect(navigator.tab == .recipes && navigator.recipeToOpen == id)

        #expect(KitchenLink.destination(of: try #require(URL(string: "souschef://recipe/not-a-uuid"))) == nil)
        #expect(KitchenLink.destination(of: try #require(URL(string: "SousChef://Plan"))) == .plan)
    }
}
