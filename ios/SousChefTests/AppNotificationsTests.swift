import Foundation
import Testing
import UserNotifications
@testable import SousChef

/// The single notification delegate shared by expiry reminders and cook timers.
@MainActor
struct AppNotificationsTests {
    @Test func registersEveryCategoryTogether() {
        // setNotificationCategories replaces the whole set, so both must be in it.
        let ids = Set(AppNotifications.categories.map(\.identifier))
        #expect(ids == [ExpiryReminders.category, CookTimerAlerts.notificationCategory])
        let expiry = AppNotifications.categories.first { $0.identifier == ExpiryReminders.category }
        #expect(expiry?.actions.map(\.identifier) == [ExpiryReminders.showPantryAction])
    }

    @Test func finishedCookTimersBannerWithSoundInTheForeground() {
        let timer = CookTimerAlerts.notificationID(UUID())
        let options = AppNotifications.presentation(for: timer)
        #expect(options.contains(.banner) && options.contains(.sound))
        #expect(AppNotifications.presentation(for: "expiry-reminder-2026-09-30").contains(.banner))
    }

    @Test func routesExpiryTapsAndLeavesCookTimersAlone() {
        let reminder = ExpiryReminderSchedule.identifierPrefix + "2026-09-30"
        #expect(AppNotifications.destination(for: reminder, action: UNNotificationDefaultActionIdentifier) == .useItUp)
        #expect(AppNotifications.destination(for: reminder, action: ExpiryReminders.showPantryAction) == .useSoon)
        #expect(AppNotifications.destination(for: CookTimerAlerts.notificationID(UUID()), action: UNNotificationDefaultActionIdentifier) == nil)
    }

    @Test func timersStaySilentOnlyWhenNotificationsAndAlarmsAreBothOff() {
        typealias Status = AlertPermissions.Status
        #expect(Status(notifications: .allowed, alarms: .off).timersCanAlert)
        #expect(Status(notifications: .off, alarms: .allowed).timersCanAlert)
        // A prompt that hasn't been answered yet is still on the way.
        #expect(Status(notifications: .notAsked, alarms: .off).timersCanAlert)
        #expect(Status(notifications: .off, alarms: .notAsked).timersCanAlert)
        #expect(!Status(notifications: .off, alarms: .off).timersCanAlert)
        #expect(!Status(notifications: .off, alarms: .unavailable).timersCanAlert)
    }

    @Test func sendsTurnedOffPermissionsToTheSettingsApp() {
        typealias Status = AlertPermissions.Status
        let allOn = Status(notifications: .allowed, alarms: .allowed, liveActivities: .allowed)
        #expect(!allOn.needsSettings && !allOn.canAsk)
        #expect(Status(notifications: .allowed, notificationSoundOff: true, alarms: .allowed, liveActivities: .allowed).needsSettings)
        #expect(Status(notifications: .allowed, alarms: .allowed, liveActivities: .off).needsSettings)
        let fresh = Status(notifications: .notAsked, alarms: .notAsked, liveActivities: .allowed)
        #expect(fresh.canAsk && !fresh.needsSettings)
        // A Mac has no alarms; that isn't something to fix in Settings.
        #expect(!Status(notifications: .allowed, alarms: .unavailable, liveActivities: .unavailable).needsSettings)
    }

    @Test func timeSensitiveOffMattersOnlyForTimersWithoutAlarms() {
        typealias Status = AlertPermissions.Status
        let withAlarms = Status(notifications: .allowed, timeSensitiveOff: true, alarms: .allowed, liveActivities: .allowed)
        #expect(!withAlarms.needsSettings)
        #expect(AlertPermissionsSection.notificationNote(for: withAlarms) == nil)
        let noAlarms = Status(notifications: .allowed, timeSensitiveOff: true, alarms: .off, liveActivities: .allowed)
        #expect(noAlarms.needsSettings)
        #expect(AlertPermissionsSection.notificationNote(for: noAlarms) == "Time Sensitive is off")
        let mac = Status(notifications: .allowed, timeSensitiveOff: true, alarms: .unavailable, liveActivities: .unavailable)
        #expect(mac.needsSettings)
    }
}
