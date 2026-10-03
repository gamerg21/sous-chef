import Foundation
import UserNotifications

/// The app's one notification delegate and category list, for every kind of
/// local notification: expiry reminders and cook timers.
///
/// `setNotificationCategories` replaces the whole set, so categories are
/// registered only here, together, never by the features themselves.
final class AppNotifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = AppNotifications()

    /// Becomes the delegate and registers every category. Called at launch.
    func activate() {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(Self.categories)
    }

    nonisolated static var categories: Set<UNNotificationCategory> {
        [ExpiryReminders.notificationCategory, CookTimerAlerts.category]
    }

    /// How a notification shows while the app is open. A finished cook timer
    /// banners with sound, since the cook may be on another screen; so does
    /// an expiry reminder.
    nonisolated static func presentation(for identifier: String) -> UNNotificationPresentationOptions {
        if identifier.hasPrefix(CookTimerAlerts.notificationPrefix) { return [.banner, .list, .sound] }
        if identifier.hasPrefix(ExpiryReminderSchedule.identifierPrefix) { return [.banner, .list, .sound] }
        return [.list]
    }

    /// Where tapping a notification (or one of its actions) leads. A cook
    /// timer just brings the app back to cook mode, which is still open.
    nonisolated static func destination(for identifier: String, action: String) -> KitchenLink.Destination? {
        guard identifier.hasPrefix(ExpiryReminderSchedule.identifierPrefix) else { return nil }
        return action == ExpiryReminders.showPantryAction ? .useSoon : .useItUp
    }

    // MARK: UNUserNotificationCenterDelegate

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let destination = Self.destination(for: response.notification.request.identifier, action: response.actionIdentifier) else { return }
        await MainActor.run { AppNavigator.shared.go(to: destination) }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        Self.presentation(for: notification.request.identifier)
    }
}
