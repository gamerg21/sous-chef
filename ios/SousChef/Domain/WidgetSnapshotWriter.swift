import Foundation
import WidgetKit

/// Keeps the widgets' `KitchenSnapshot` current. `Kitchen.changed()` asks for
/// a refresh after every edit, and the app refreshes when it becomes active
/// (iCloud or server changes may have arrived) and when it goes to the
/// background. Timelines reload only when the snapshot actually changed, so
/// frequent edits don't use up WidgetKit's reload budget.
enum WidgetSnapshotWriter {
    private static var pending: Task<Void, Never>?

    /// Writes a fresh snapshot shortly, coalescing bursts of edits.
    static func scheduleRefresh(_ kitchen: Kitchen = .shared) {
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            refresh(kitchen)
        }
    }

    /// Writes the snapshot now, such as when the app is about to be suspended.
    static func refresh(_ kitchen: Kitchen = .shared) {
        pending?.cancel()
        pending = nil
        guard let url = KitchenSnapshot.fileURL, let data = try? snapshot(of: kitchen).encoded() else { return }
        if (try? Data(contentsOf: url)) == data { return }
        do {
            try data.write(to: url, options: .atomic)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            // Widgets keep showing the last snapshot.
        }
    }

    static func snapshot(of kitchen: Kitchen, now: Date = .now) -> KitchenSnapshot {
        let horizon = Calendar.current.date(byAdding: .day, value: KitchenSnapshot.expiringHorizonDays + 1,
                                            to: Calendar.current.startOfDay(for: now)) ?? now
        let expiring = kitchen.onHand()
            .compactMap { item -> KitchenSnapshot.ExpiringItem? in
                guard let date = item.expiresOn, date < horizon else { return nil }
                return .init(id: item.uuid, name: item.name, location: item.location.rawValue, expiresOn: date)
            }
            .prefix(KitchenSnapshot.expiringLimit)

        let open = kitchen.openShoppingItems()
        let shopping = KitchenSnapshot.ShoppingSummary(openCount: open.count,
                                                       names: open.prefix(KitchenSnapshot.shoppingNameLimit).map(\.name))
        return KitchenSnapshot(expiring: Array(expiring), shopping: shopping)
    }
}
