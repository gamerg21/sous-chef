import Foundation

/// The daily reminders to schedule, worked out from the pantry as it is now.
///
/// Each day gets its own notification with that day's list, and days with
/// nothing expiring get none, instead of one repeating notification that
/// can't know what will be in the fridge. The app rebuilds the schedule
/// whenever the pantry changes or it comes to the foreground.
nonisolated struct ExpiryReminderSchedule: Equatable, Sendable {
    struct Reminder: Equatable, Sendable {
        var id: String
        var fireDate: Date
        var title: String
        var body: String
    }

    static let identifierPrefix = "expiry-reminder-"
    /// How far ahead to schedule; opening the app extends it.
    static let daysAhead = 14

    var reminders: [Reminder]

    /// The title and body for one day's items; nil when there's nothing to say.
    static func content(for items: [ExpiringFood]) -> (title: String, body: String)? {
        guard !items.isEmpty else { return nil }
        let title = items.count == 1 ? "Use it up" : "Use up \(items.count) items"
        return (title, ExpiringFood.summary(items) + ".")
    }

    init(reminders: [Reminder]) {
        self.reminders = reminders
    }

    /// Reminders at `hour`:`minute` on each of the next `daysAhead` days that
    /// are still to come, each listing what expires within `window` days of it.
    init(stock: [ExpiringFood.Stock], window: Int, hour: Int, minute: Int, now: Date = .now, days: Int = daysAhead, calendar: Calendar = .current) {
        let today = calendar.startOfDay(for: now)
        reminders = (0..<days).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset, to: today),
                  let fire = calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day),
                  fire > now,
                  let content = Self.content(for: ExpiringFood.find(in: stock, within: window, now: fire, calendar: calendar)) else { return nil }
            let stamp = calendar.dateComponents([.year, .month, .day], from: day)
            let id = Self.identifierPrefix + String(format: "%04d-%02d-%02d", stamp.year ?? 0, stamp.month ?? 0, stamp.day ?? 0)
            return Reminder(id: id, fireDate: fire, title: content.title, body: content.body)
        }
    }
}
