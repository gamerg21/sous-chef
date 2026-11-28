import Foundation
import SwiftUI
import Testing
@testable import SousChef

/// Countdowns change on the timer's own seconds, whenever they're drawn.
@MainActor
struct CountdownScheduleTests {
    /// Off the whole second, as a tap always is.
    private let start = Date(timeIntervalSinceReferenceDate: 800_000_000.2137)

    private func timer(_ seconds: Int, startedAfter offset: TimeInterval = 0) -> CookTimer {
        CookTimer(label: "Step 1", seconds: seconds, started: start.addingTimeInterval(offset))
    }

    /// The first entries for a view drawn `offset` seconds after `start`, as
    /// seconds after `start`.
    private func ticks(_ timers: [CookTimer], drawnAfter offset: TimeInterval, count: Int = 4) -> [TimeInterval] {
        let entries = CountdownSchedule(timers).entries(from: start.addingTimeInterval(offset), mode: .normal)
        return entries.prefix(count).map { ($0.timeIntervalSince(start) * 1000).rounded() / 1000 }
    }

    @Test func ticksOnTheTimersOwnSeconds() {
        // The tick it's on, then each second after.
        #expect(ticks([timer(600)], drawnAfter: 137.6) == [137, 138, 139, 140])
        #expect(ticks([timer(600)], drawnAfter: 5) == [5, 6, 7, 8])
    }

    @Test func aRedrawDoesntMoveTheNextTick() {
        // Changing step redraws the countdown at any moment in the second.
        for moment in [2.0, 2.05, 2.5, 2.999] {
            #expect(ticks([timer(600)], drawnAfter: moment, count: 2) == [2, 3])
        }
    }

    @Test func everyTickIsAWholeSecondFromTheStart() {
        // Exactly, an hour in: a tick that drifted would show a second twice.
        let entries = CountdownSchedule([timer(3600)]).entries(from: start.addingTimeInterval(0.5), mode: .normal)
        #expect(entries.map { $0.timeIntervalSince(start) } == (0...3601).map(TimeInterval.init))
    }

    @Test func eachTickShowsOneSecondLess() {
        let short = timer(5)
        let entries = Array(CountdownSchedule([short]).entries(from: start, mode: .normal))
        #expect(entries.prefix(6).map { short.remaining(at: $0) } == [5, 4, 3, 2, 1, 0])
        #expect(entries[5] == short.ends)
    }

    /// A timeline view draws an entry only once it has the one after it, so
    /// the last tick always has a follower, and then the entries stop.
    @Test func stopsOnceTheEndIsDrawn() {
        #expect(ticks([timer(3)], drawnAfter: 1.5, count: 10) == [1, 2, 3, 4])
        // Long done, and with no timers: the entry to draw, and its follower.
        #expect(ticks([timer(3)], drawnAfter: 90, count: 10) == [3, 4])
        #expect(ticks([], drawnAfter: 7.25, count: 10) == [7.25, 8.25])
    }

    @Test func aTimerAboutToStartTicksFromItsStart() {
        #expect(ticks([timer(600)], drawnAfter: -0.5) == [-0.5, 0, 1, 2])
        #expect(timer(600).remaining(at: start.addingTimeInterval(-0.5)) == 600)
    }

    @Test func severalTimersEachKeepTheirOwnSeconds() {
        let pasta = timer(60)
        let sauce = timer(120, startedAfter: 0.4)
        #expect(ticks([pasta, sauce], drawnAfter: 10.1, count: 5) == [10, 10.4, 11, 11.4, 12])
        // Once the pasta's done, only the sauce ticks.
        #expect(ticks([pasta, sauce], drawnAfter: 59.5, count: 5) == [59.4, 60, 60.4, 61.4, 62.4])
        // A tick of one leaves the other's clock alone.
        #expect(sauce.remaining(at: start.addingTimeInterval(10)) == sauce.remaining(at: start.addingTimeInterval(9.4)))
    }

    @Test func timersInStepShareATick() {
        #expect(ticks([timer(60), timer(300)], drawnAfter: 3.2) == [3, 4, 5, 6])
        #expect(ticks([timer(2), timer(4)], drawnAfter: 0, count: 10) == [0, 1, 2, 3, 4, 5])
    }

    @Test func countsDownRoundedUpAndEndsOnTime() {
        let rice = timer(600)
        #expect(rice.remaining(at: start) == 600)
        #expect(rice.remaining(at: start.addingTimeInterval(0.999)) == 600)
        #expect(rice.remaining(at: start.addingTimeInterval(1)) == 599)
        #expect(rice.remaining(at: rice.ends.addingTimeInterval(-0.001)) == 1)
        #expect(!rice.isDone(at: rice.ends.addingTimeInterval(-0.001)))
        #expect(rice.remaining(at: rice.ends) == 0)
        #expect(rice.isDone(at: rice.ends))
        #expect(rice.remaining(at: rice.ends.addingTimeInterval(3600)) == 0)
    }

    /// The Live Activity counts down with the system's timer text; cook mode
    /// should read the same at any moment.
    @Test func readsTheSameAsTheSystemCountdown() {
        let rice = timer(600)
        let system = SystemFormatStyle.Timer(countingDownIn: rice.started..<rice.ends).locale(Locale(identifier: "en_US"))
        for offset in [-1, 0, 0.001, 0.5, 0.999, 1, 1.001, 59.5, 60, 598.999, 599, 599.5, 599.999, 600, 600.5, 700] {
            let date = start.addingTimeInterval(offset)
            let left = rice.remaining(at: date)
            let clock = String(format: "%d:%02d", left / 60, left % 60)
            #expect(String(system.format(date).characters) == clock, "\(offset) seconds in")
        }
    }
}
