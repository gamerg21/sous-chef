import Foundation
import WidgetKit

nonisolated struct KitchenEntry: TimelineEntry {
    let date: Date
    /// Nil until the app has written its first snapshot.
    let snapshot: KitchenSnapshot?
}

/// Serves the app's latest snapshot. The app reloads timelines whenever the
/// snapshot changes; between changes, an entry at each of the next few
/// midnights keeps "Tomorrow" and "3 days" counting down and moves Tonight's
/// meal on to the next day's.
nonisolated struct KitchenTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> KitchenEntry {
        KitchenEntry(date: .now, snapshot: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (KitchenEntry) -> Void) {
        let snapshot = KitchenSnapshot.load()
        completion(KitchenEntry(date: .now, snapshot: context.isPreview && snapshot == nil ? .preview : snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KitchenEntry>) -> Void) {
        let snapshot = KitchenSnapshot.load()
        let now = Date.now
        let calendar = Calendar.current
        let midnights = (1...7).compactMap { calendar.date(byAdding: .day, value: $0, to: calendar.startOfDay(for: now)) }
        let entries = [KitchenEntry(date: now, snapshot: snapshot)] + midnights.map { KitchenEntry(date: $0, snapshot: snapshot) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

nonisolated extension KitchenSnapshot {
    /// Sample kitchen for the widget gallery.
    static var preview: KitchenSnapshot {
        let today = Calendar.current.startOfDay(for: .now)
        func day(_ offset: Int) -> Date { Calendar.current.date(byAdding: .day, value: offset, to: today) ?? today }
        return KitchenSnapshot(
            expiring: [
                .init(id: UUID(), name: "Spinach", location: "fridge", expiresOn: day(0)),
                .init(id: UUID(), name: "Greek yogurt", location: "fridge", expiresOn: day(1)),
                .init(id: UUID(), name: "Chicken thighs", location: "fridge", expiresOn: day(2)),
                .init(id: UUID(), name: "Sourdough", location: "pantry", expiresOn: day(4)),
            ],
            shopping: .init(openCount: 5, names: ["Milk", "Eggs", "Lemons", "Parmesan", "Basil"]),
            expiringWindowDays: 3,
            tonight: .init(id: UUID(), recipeID: UUID(), recipeName: "Lemon Chicken Traybake", day: dayKey(today),
                           slot: "dinner", servings: 4, missing: 1, photo: nil))
    }
}
