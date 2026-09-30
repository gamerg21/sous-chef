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
    }

    struct Countdown: Codable, Hashable, Sendable, Identifiable {
        var id: UUID
        /// "Step 3"
        var label: String
        var startedAt: Date
        var endsAt: Date

        var interval: ClosedRange<Date> { startedAt...max(startedAt, endsAt) }

        func isDone(at date: Date) -> Bool { endsAt <= date }
    }
}
