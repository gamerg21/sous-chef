import ActivityKit
import Foundation

/// The Live Activity for cook mode's timers. One activity per cooking
/// session lists every timer, so the Dynamic Island shows a single countdown
/// (the next to finish) instead of a stack of competing activities.
/// Compiled into the app and the widget extension.
nonisolated struct CookTimerAttributes: ActivityAttributes {
    var recipeTitle: String

    struct ContentState: Codable, Hashable, Sendable {
        /// Running timers soonest-to-finish first, then finished ones.
        var timers: [Countdown]

        /// The timer the compact and minimal presentations count down.
        var next: Countdown? { timers.first }

        /// Puts countdowns in the activity's order as of `now`: running ones
        /// soonest to finish first, then finished ones, most recent first.
        init(ordering countdowns: [Countdown], now: Date) {
            let running = countdowns.filter { !$0.isDone(at: now) }.sorted { $0.endsAt < $1.endsAt }
            let done = countdowns.filter { $0.isDone(at: now) }.sorted { $0.endsAt > $1.endsAt }
            timers = running + done
        }

        init(timers: [Countdown]) {
            self.timers = timers
        }

        /// The timers listed under the next one when `rows` lines are free:
        /// all of them if they fit, otherwise one line fewer and a "+N more"
        /// line for the rest, finished ones included.
        func others(rows: Int) -> (shown: [Countdown], hidden: Int) {
            let rest = Array(timers.dropFirst())
            guard rest.count > rows else { return (rest, 0) }
            let shown = Array(rest.prefix(max(0, rows - 1)))
            return (shown, rest.count - shown.count)
        }

        /// Whether a countdown should read "Done". Once the activity is stale
        /// its next timer has finished, since the stale date is set to that
        /// moment, even if the system renders a little early.
        func isDone(_ countdown: Countdown, at date: Date, isStale: Bool) -> Bool {
            countdown.isDone(at: date) || (isStale && countdown.id == next?.id)
        }
    }

    struct Countdown: Codable, Hashable, Sendable, Identifiable {
        var id: UUID
        /// "Step 3"
        var label: String
        var startedAt: Date
        var endsAt: Date

        var interval: ClosedRange<Date> { startedAt...max(startedAt, endsAt) }

        func isDone(at date: Date) -> Bool { endsAt <= date }

        /// Whether the smaller rows should show hours and minutes ("2h 59m")
        /// rather than a clock: only with an hour or more to go, where the
        /// clock's seconds are noise and it runs widest.
        func usesShortFormat(at date: Date) -> Bool { endsAt.timeIntervalSince(date) >= 3600 }

        /// "2h 59m": the time left in whole hours and minutes, rounded down
        /// like a countdown. Shown with `Text(.durationOffset(to: endsAt),
        /// format:)`, it ticks without the app sending updates.
        static let shortFormat = Duration.UnitsFormatStyle(allowedUnits: [.hours, .minutes], width: .narrow,
                                                           maximumUnitCount: 2, fractionalPart: .hide(rounded: .down))
    }
}
