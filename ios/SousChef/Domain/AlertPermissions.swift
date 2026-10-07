import ActivityKit
import AlarmKit
import UIKit
import UserNotifications

/// What the person allowed for the ways Sous Chef reaches them outside the
/// app: notifications (expiry reminders, and every cook timer), alarms (cook
/// timers that ring through silent mode) and Live Activities (timers on the
/// Lock Screen and in the Dynamic Island). Settings shows it, so a "Don't
/// Allow" tapped during onboarding can be found and undone.
enum AlertPermissions {
    enum State: Equatable {
        case allowed
        case off
        case notAsked
        /// Not on this device, such as alarms on a Mac.
        case unavailable
    }

    struct Status: Equatable {
        var notifications: State = .notAsked
        /// Notifications are allowed but their sound is switched off.
        var notificationSoundOff = false
        /// Notifications are allowed but Time Sensitive ones are switched
        /// off, so without alarms a timer can be held back by Focus.
        var timeSensitiveOff = false
        var alarms: State = .notAsked
        var liveActivities: State = .notAsked

        /// False once notifications are off and alarms are off too, so a
        /// finished timer can't reach the cook with Sous Chef closed. Anything
        /// not asked yet still counts, since its prompt is on the way.
        var timersCanAlert: Bool { notifications != .off || alarms == .allowed || alarms == .notAsked }
        /// Something can still be asked for in the app.
        var canAsk: Bool { notifications == .notAsked || alarms == .notAsked }
        /// Something was turned off and only the Settings app can turn it back on.
        var needsSettings: Bool {
            notifications == .off || notificationSoundOff || alarms == .off || liveActivities == .off
                || (timeSensitiveOff && alarms != .allowed)
        }
    }

    static func current() async -> Status {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        var status = Status()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: status.notifications = .allowed
        case .denied: status.notifications = .off
        case .notDetermined: status.notifications = .notAsked
        @unknown default: status.notifications = .off
        }
        status.notificationSoundOff = status.notifications == .allowed && settings.soundSetting == .disabled
        status.timeSensitiveOff = status.notifications == .allowed && settings.timeSensitiveSetting == .disabled
        status.alarms = alarms
        if ProcessInfo.processInfo.isiOSAppOnMac {
            status.liveActivities = .unavailable
        } else {
            status.liveActivities = ActivityAuthorizationInfo().areActivitiesEnabled ? .allowed : .off
        }
        return status
    }

    static var alarms: State {
        guard CookTimerAlarms.isAvailable else { return .unavailable }
        switch AlarmManager.shared.authorizationState {
        case .authorized: return .allowed
        case .denied: return .off
        case .notDetermined: return .notAsked
        @unknown default: return .off
        }
    }

    /// Asks for notifications, then alarms. The alarm prompt waits until the
    /// notification prompt has gone and Sous Chef is active again: asked while
    /// the app is still inactive, AlarmKit can record a denial without ever
    /// showing its prompt.
    static func requestAll() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        await untilActive()
        _ = await CookTimerAlarms.authorize()
    }

    /// Waits, up to a few seconds, for the app to be active.
    static func untilActive() async {
        for _ in 0..<30 where UIApplication.shared.applicationState != .active {
            try? await Task.sleep(for: .milliseconds(100))
        }
        // The prompt's window can still be on its way out when the app turns active.
        try? await Task.sleep(for: .milliseconds(300))
    }

    /// Sous Chef's page in the Settings app, with its Notifications, Alarms
    /// and Live Activities switches.
    static var settingsURL: URL? { URL(string: UIApplication.openSettingsURLString) }
}
