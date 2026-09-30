import Foundation
import Observation
import UserNotifications

/// Opt-in local notifications about food that's about to expire. Everything
/// is scheduled on the device from the pantry; there is no push server.
@Observable
final class ExpiryReminders {
    static let shared = ExpiryReminders()

    nonisolated private static let enabledKey = "expiry.reminders.enabled"
    private static let hourKey = "expiry.reminders.hour"
    private static let minuteKey = "expiry.reminders.minute"
    nonisolated static let category = "expiry-reminder"
    nonisolated static let showPantryAction = "show-pantry"

    /// Registered with the others by `AppNotifications`.
    nonisolated static var notificationCategory: UNNotificationCategory {
        let showPantry = UNNotificationAction(identifier: showPantryAction, title: "Show in Pantry", options: [.foreground])
        return UNNotificationCategory(identifier: category, actions: [showPantry], intentIdentifiers: [])
    }

    private let center = UNUserNotificationCenter.current()
    private let defaults = UserDefaults.standard
    private var pending: Task<Void, Never>?

    /// Whether the person turned reminders on here. Authorization is asked
    /// for only when they do.
    private(set) var isEnabled: Bool
    /// Notifications are switched off for Sous Chef in the Settings app.
    private(set) var isDenied = false
    /// The daily reminder time; 9:00 unless changed.
    var time: DateComponents {
        didSet {
            defaults.set(time.hour, forKey: Self.hourKey)
            defaults.set(time.minute, forKey: Self.minuteKey)
            reschedule()
        }
    }

    init() {
        isEnabled = defaults.bool(forKey: Self.enabledKey)
        time = DateComponents(hour: defaults.object(forKey: Self.hourKey) as? Int ?? 9, minute: defaults.object(forKey: Self.minuteKey) as? Int ?? 0)
    }

    /// Turns reminders on (asking permission the first time) or off.
    func setEnabled(_ enabled: Bool) async {
        if enabled {
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            isDenied = !granted
            isEnabled = granted
        } else {
            isEnabled = false
        }
        defaults.set(isEnabled, forKey: Self.enabledKey)
        await rescheduleNow()
    }

    /// Notices when permission was withdrawn in the Settings app.
    func refreshAuthorization() async {
        let status = await center.notificationSettings().authorizationStatus
        isDenied = status == .denied
    }

    /// Rebuilds the schedule shortly, so a burst of pantry edits reschedules once.
    func reschedule(_ kitchen: Kitchen = .shared) {
        // Turning reminders off already cleared the schedule.
        guard isEnabled else { return }
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            await rescheduleNow(kitchen)
        }
    }

    func rescheduleNow(_ kitchen: Kitchen = .shared) async {
        let existing = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(ExpiryReminderSchedule.identifierPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: existing)
        guard isEnabled else { return }
        await refreshAuthorization()
        guard !isDenied else { return }

        let stock = kitchen.fetch(PantryItem.self).map(\.expiringStock)
        let schedule = ExpiryReminderSchedule(stock: stock, window: ExpiringFood.windowDays, hour: time.hour ?? 9, minute: time.minute ?? 0)
        for reminder in schedule.reminders {
            let content = UNMutableNotificationContent()
            content.title = reminder.title
            content.body = reminder.body
            content.sound = .default
            content.categoryIdentifier = Self.category
            content.threadIdentifier = Self.category
            let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: reminder.fireDate)
            let request = UNNotificationRequest(identifier: reminder.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false))
            try? await center.add(request)
        }
    }
}
