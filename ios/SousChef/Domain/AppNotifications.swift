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

    // The completion-handler forms, finished on the main thread: after a tap
    // the system updates the app's snapshot when the handler is called, and
    // UIKit aborts if that happens off the main thread. The async forms
    // finished wherever the task ended, which crashed on tapping a cook timer.

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping @Sendable () -> Void) {
        let destination = Self.destination(for: response.notification.request.identifier, action: response.actionIdentifier)
        Task { @MainActor in
            if let destination { AppNavigator.shared.go(to: destination) }
            completionHandler()
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping @Sendable (UNNotificationPresentationOptions) -> Void) {
        let options = Self.presentation(for: notification.request.identifier)
        Task { @MainActor in completionHandler(options) }
    }
}
