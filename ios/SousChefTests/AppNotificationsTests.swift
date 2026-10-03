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
}
