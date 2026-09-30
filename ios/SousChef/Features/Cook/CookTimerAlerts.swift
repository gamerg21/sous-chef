import ActivityKit
import Foundation
import UserNotifications

/// Carries cook mode's timers outside the app: a Live Activity on the Lock
/// Screen and in the Dynamic Island, and a local notification with sound for
/// each timer so it's heard with the app in the background or the phone
/// locked. Cook mode calls `sync` whenever its timers change and with no
/// timers when it closes; the in-app timers never depend on either.
///
/// Where Live Activities aren't available (a Mac running the iPad app, or
/// the person turned them off) only the notifications are used.
final class CookTimerAlerts {
    static let shared = CookTimerAlerts()

    /// Notification identifiers start with this; nothing else in the app uses it.
    nonisolated static let notificationPrefix = "souschef.cook-timer."
    nonisolated static let notificationCategory = "SOUSCHEF_COOK_TIMER"

    /// The running activity's ID. Activities are looked up by ID rather than
    /// kept, since `Activity` can't be held across concurrency domains.
    private var activityID: String?
    private var scheduled: Set<UUID> = []
    private var askedForNotifications = false

    /// The activity's state for a set of timers: running ones soonest to
    /// finish first, then finished ones, most recent first.
    nonisolated static func contentState(for timers: [CookTimer], now: Date = .now) -> CookTimerAttributes.ContentState {
        let countdowns = timers.map {
            CookTimerAttributes.Countdown(id: $0.id, label: $0.label, startedAt: $0.started, endsAt: $0.ends)
        }
        let running = countdowns.filter { !$0.isDone(at: now) }.sorted { $0.endsAt < $1.endsAt }
        let done = countdowns.filter { $0.isDone(at: now) }.sorted { $0.endsAt > $1.endsAt }
        return CookTimerAttributes.ContentState(timers: running + done)
    }

    /// When the system should treat the activity as out of date: the moment
    /// the next running timer finishes, so its layout can say so.
    nonisolated static func staleDate(for state: CookTimerAttributes.ContentState, now: Date = .now) -> Date? {
        state.timers.first { !$0.isDone(at: now) }?.endsAt
    }

    /// Brings the Live Activity and scheduled notifications in line with
    /// cook mode's timers. An empty list ends everything.
    func sync(recipeTitle: String, timers: [CookTimer]) {
        syncNotifications(recipeTitle: recipeTitle, timers: timers)
        Task { await syncActivity(recipeTitle: recipeTitle, timers: timers) }
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

    // MARK: Notifications

    private func syncNotifications(recipeTitle: String, timers: [CookTimer]) {
        let center = UNUserNotificationCenter.current()
        let current = Set(timers.map(\.id))
        let removed = scheduled.subtracting(current)
        if !removed.isEmpty {
            let ids = removed.map(Self.notificationID)
            center.removePendingNotificationRequests(withIdentifiers: ids)
            center.removeDeliveredNotifications(withIdentifiers: ids)
        }
        scheduled.subtract(removed)

        let new = timers.filter { !scheduled.contains($0.id) && !$0.isDone(at: .now) }
        guard !new.isEmpty else { return }
        scheduled.formUnion(new.map(\.id))
        Task {
            guard await authorizeNotifications() else { return }
            for timer in new {
                let seconds = timer.ends.timeIntervalSinceNow
                guard seconds > 0 else { continue }
                try? await center.add(Self.request(for: timer, recipeTitle: recipeTitle, in: seconds))
            }
        }
    }

    /// Asks once, the first time a timer starts, and never nags afterwards.
    private func authorizeNotifications() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        case .notDetermined where !askedForNotifications:
            askedForNotifications = true
            return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        default: return false
        }
    }

    nonisolated static func notificationID(_ timer: UUID) -> String { notificationPrefix + timer.uuidString }

    nonisolated static func request(for timer: CookTimer, recipeTitle: String, in seconds: TimeInterval) -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = "\(timer.label) timer is done"
        content.body = recipeTitle
        content.sound = .default
        content.categoryIdentifier = notificationCategory
        content.threadIdentifier = notificationCategory
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, seconds), repeats: false)
        return UNNotificationRequest(identifier: notificationID(timer.id), content: content, trigger: trigger)
    }
}
