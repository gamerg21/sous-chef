import Foundation
import SwiftUI

/// Redraws countdowns as their clocks change: each time a timer has a whole
/// second less to go, and as it ends.
///
/// The ticks come from the timers themselves, not from when the view was
/// drawn: a schedule that starts at `.now` starts over, on a new part of the
/// second, each time its view is redrawn. Every countdown of a timer changes
/// on the same frame, in step with the Live Activity's, and a redraw in
/// between (another step, coming back from the resume bar) doesn't shift it.
///
/// Timers started at different moments tick on their own seconds, so a view
/// of several redraws for each of them.
nonisolated struct CountdownSchedule: TimelineSchedule, Sendable {
    let timers: [CookTimer]

    init(_ timers: [CookTimer]) {
        self.timers = timers
    }

    func entries(from startDate: Date, mode: TimelineScheduleMode) -> Entries {
        Entries(timers: timers, from: startDate)
    }

    nonisolated struct Entries: Sequence, IteratorProtocol, Sendable {
        /// A timer still counting, and the whole seconds into it its next
        /// tick comes. Counting them keeps every tick a whole number of
        /// seconds from the start, however long the timer runs.
        private nonisolated struct Countdown: Sendable {
            let started: Date
            let seconds: Int
            var elapsed: Int

            var tick: Date { started.addingTimeInterval(TimeInterval(elapsed)) }
        }

        /// The tick the countdowns are on as the entries start. A timeline
        /// view draws with the latest entry that isn't in the future, so
        /// there's always this one.
        private var first: Date?
        private var running: [Countdown] = []
        /// One entry past the last tick. A timeline view moves on to an
        /// entry only once it has the one after it, so without a follower a
        /// timer's end would never be drawn.
        private var closing: Date?

        init(timers: [CookTimer], from start: Date) {
            var latest: Date?
            for timer in timers {
                // `Swift.`: in a sequence, plain `min` and `max` are its own.
                let whole = Int(start.timeIntervalSince(timer.started).rounded(.down))
                if whole >= 0 {
                    let tick = timer.started.addingTimeInterval(TimeInterval(Swift.min(whole, timer.seconds)))
                    latest = Swift.max(latest ?? tick, tick)
                }
                let next = Swift.max(0, whole + 1)
                if next <= timer.seconds {
                    running.append(Countdown(started: timer.started, seconds: timer.seconds, elapsed: next))
                }
            }
            // Before any timer starts, or with none, there's still one entry.
            first = latest ?? start
        }

        /// Runs out a second after the last timer ends: nothing changes then.
        mutating func next() -> Date? {
            if let first {
                self.first = nil
                closing = first.addingTimeInterval(1)
                return first
            }
            guard let tick = running.map(\.tick).min() else {
                defer { closing = nil }
                return closing
            }
            // Timers in step share a tick.
            for index in running.indices where running[index].tick <= tick {
                running[index].elapsed += 1
            }
            running.removeAll { $0.elapsed > $0.seconds }
            closing = tick.addingTimeInterval(1)
            return tick
        }
    }
}
