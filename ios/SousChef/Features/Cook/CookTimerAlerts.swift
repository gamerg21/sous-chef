import ActivityKit
import Foundation
import UserNotifications

/// Carries cook mode's timers outside the app: a Live Activity on the Lock
/// Screen and in the Dynamic Island, a local notification with sound for each
/// timer, and, where alarms are allowed, an alarm (`CookTimerAlarms`) that
/// rings like the Clock app's, even in silent mode. Cook mode calls `sync`
/// whenever its timers change and with no timers when it closes; the in-app
/// timers never depend on any of them.
///
/// Where Live Activities aren't available (a Mac running the iPad app, or
/// the person turned them off) only the notifications are used.
final class CookTimerAlerts {
    static let shared = CookTimerAlerts()

    /// Notification identifiers start with this; nothing else in the app uses it.
    nonisolated static let notificationPrefix = "souschef.cook-timer."
    nonisolated static let notificationCategory = "SOUSCHEF_COOK_TIMER"

    /// Registered with the others by `AppNotifications`, which also banners
    /// finished timers with sound while the app is open.
    nonisolated static var category: UNNotificationCategory {
        UNNotificationCategory(identifier: notificationCategory, actions: [], intentIdentifiers: [])
    }

    /// The running activity's ID. Activities are looked up by ID rather than
    /// kept, since `Activity` can't be held across concurrency domains.
    private var activityID: String?
    /// Timers with a notification, and those of them that also have an alarm.
    private var scheduled: Set<UUID> = []
    private var alarms: Set<UUID> = []
    private var askedForNotifications = false

    /// The activity's state for a set of timers: running ones soonest to
    /// finish first, then finished ones, most recent first.
    nonisolated static func contentState(for timers: [CookTimer], now: Date = .now) -> CookTimerAttributes.ContentState {
        let countdowns = timers.map {
            CookTimerAttributes.Countdown(id: $0.id, label: $0.label, startedAt: $0.started, endsAt: $0.ends)
        }
        return CookTimerAttributes.ContentState(ordering: countdowns, now: now)
    }

    /// An activity's state brought up to date without cook mode: the same
    /// timers, re-sorted so the ones that have finished move behind the
    /// running ones and read "Done".
    nonisolated static func refreshed(_ state: CookTimerAttributes.ContentState, now: Date = .now) -> CookTimerAttributes.ContentState {
        CookTimerAttributes.ContentState(ordering: state.timers, now: now)
    }

    /// When the system should treat the activity as out of date: the moment
    /// the next running timer finishes, so its layout can say so.
    nonisolated static func staleDate(for state: CookTimerAttributes.ContentState, now: Date = .now) -> Date? {
        state.timers.first { !$0.isDone(at: now) }?.endsAt
    }

    /// Brings the Live Activity and scheduled notifications in line with
    /// cook mode's timers. An empty list ends everything.
    func sync(recipeTitle: String, timers: [CookTimer]) {
        syncAlarmsAndNotifications(recipeTitle: recipeTitle, timers: timers)
        Task { await syncActivity(recipeTitle: recipeTitle, timers: timers) }
    }

    /// Re-sorts the Live Activity's timers as of now and moves its stale date
    /// to the next running timer. The alarm's buttons call this when a timer
    /// rings, so the finished timer says "Done" without opening Sous Chef.
    /// Works from the activity's own state, which outlives cook mode.
    func refreshActivity() async {
        let now = Date.now
        for activity in Activity<CookTimerAttributes>.activities
        where activity.activityState == .active || activity.activityState == .stale {
            let state = Self.refreshed(activity.content.state, now: now)
            await activity.update(ActivityContent(state: state, staleDate: Self.staleDate(for: state, now: now)))
        }
    }

    /// Ends activities left over from a previous launch; their timers lived
    /// in a cook mode that's gone. Notifications already scheduled still fire.
    func endLeftoverActivities() {
        let current = activityID
        Task {
            for leftover in Activity<CookTimerAttributes>.activities where leftover.id != current {
                await leftover.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    private nonisolated static func activity(id: String?) -> Activity<CookTimerAttributes>? {
        guard let id else { return nil }
        return Activity<CookTimerAttributes>.activities.first { $0.id == id }
    }

    // MARK: Live Activity

    private static var activitiesAvailable: Bool {
        !ProcessInfo.processInfo.isiOSAppOnMac && ActivityAuthorizationInfo().areActivitiesEnabled
    }

    private func syncActivity(recipeTitle: String, timers: [CookTimer]) async {
        let now = Date.now
        let state = Self.contentState(for: timers, now: now)
        let content = ActivityContent(state: state, staleDate: Self.staleDate(for: state, now: now))

        if timers.isEmpty {
            let ending = Self.activity(id: activityID)
            activityID = nil
            await ending?.end(content, dismissalPolicy: .immediate)
            return
        }
        if let activity = Self.activity(id: activityID), activity.activityState == .active || activity.activityState == .stale {
            await activity.update(content)
            return
        }
        guard Self.activitiesAvailable, timers.contains(where: { !$0.isDone(at: now) }) else { return }
        do {
            activityID = try Activity.request(attributes: CookTimerAttributes(recipeTitle: recipeTitle), content: content).id
        } catch {
            // Live Activities are a bonus; the in-app timers and notifications still run.
            activityID = nil
        }
    }

    // MARK: Alarms and notifications

    /// Removed timers lose their notification and alarm (silencing a ringing
    /// alarm). New running timers always get a notification with sound, and
    /// also an alarm when alarms are allowed. Alarms are scheduled first, so
    /// a timer without one gets a Time Sensitive notification instead. The notification isn't only a
    /// fallback for when alarms aren't allowed: an alarm that was scheduled
    /// can still fail to ring, and then the notification is all the cook gets.
    private func syncAlarmsAndNotifications(recipeTitle: String, timers: [CookTimer]) {
        let center = UNUserNotificationCenter.current()
        let current = Set(timers.map(\.id))
        let removed = scheduled.subtracting(current)
        if !removed.isEmpty {
            let ids = removed.map(Self.notificationID)
            center.removePendingNotificationRequests(withIdentifiers: ids)
            center.removeDeliveredNotifications(withIdentifiers: ids)
            for id in removed where alarms.contains(id) { CookTimerAlarms.cancel(id) }
        }
        scheduled.subtract(removed)
        alarms.subtract(removed)

        let new = timers.filter { !scheduled.contains($0.id) && !$0.isDone(at: .now) }
        guard !new.isEmpty else { return }
        // Claimed now so a quick second sync doesn't schedule them twice.
        scheduled.formUnion(new.map(\.id))
        Task {
            if await CookTimerAlarms.authorize() {
                for timer in new where scheduled.contains(timer.id) {
                    guard (try? await CookTimerAlarms.schedule(timer, recipeTitle: recipeTitle)) != nil else { continue }
                    alarms.insert(timer.id)
                    // Removed while the alarm was being scheduled.
                    if !scheduled.contains(timer.id) {
                        CookTimerAlarms.cancel(timer.id)
                        alarms.remove(timer.id)
                    }
                }
            }
            guard await authorizeNotifications() else { return }
            for timer in new where scheduled.contains(timer.id) {
                let seconds = timer.ends.timeIntervalSinceNow
                guard seconds > 0 else { continue }
                let request = Self.request(for: timer, recipeTitle: recipeTitle, in: seconds, hasAlarm: alarms.contains(timer.id))
                try? await center.add(request)
            }
        }
    }

    /// Onboarding normally asks first. For anyone who skipped that, asks once,
    /// the first time a timer starts, and never nags afterwards.
    private func authorizeNotifications() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        case .notDetermined where !askedForNotifications:
            askedForNotifications = true
            // The alarm prompt may have just closed.
            await AlertPermissions.untilActive()
            return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        default: return false
        }
    }

    nonisolated static func notificationID(_ timer: UUID) -> String { notificationPrefix + timer.uuidString }

    /// A timer's notification. Without an alarm it's all the cook gets, so it
    /// is Time Sensitive and breaks through Focus; with one, the alarm already
    /// does, and the notification stays an ordinary one.
    nonisolated static func request(for timer: CookTimer, recipeTitle: String, in seconds: TimeInterval,
                                    hasAlarm: Bool = false) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = "\(timer.label) timer is done"
        content.body = recipeTitle
        content.sound = .default
        content.categoryIdentifier = notificationCategory
        content.threadIdentifier = notificationCategory
        content.interruptionLevel = hasAlarm ? .active : .timeSensitive
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
        return UNNotificationRequest(identifier: notificationID(timer.id), content: content, trigger: trigger)
    }
}
