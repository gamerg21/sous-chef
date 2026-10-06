import ActivityKit
import SwiftUI
import WidgetKit

/// Cook mode's timers on the Lock Screen and in the Dynamic Island. The
/// countdowns are `Text(timerInterval:)`, `Text(.durationOffset(to:), format:)` and
/// `ProgressView(timerInterval:)`, so they tick without the app sending
/// updates.
struct CookTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CookTimerAttributes.self) { context in
            CookTimerLockScreenView(title: context.attributes.recipeTitle, state: context.state, isStale: context.isStale)
                .padding()
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(.brand)
        } dynamicIsland: { context in
            let state = context.state
            let next = state.next
            let nextDone = next.map { state.isDone($0, at: .now, isStale: context.isStale) } ?? false
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if let next {
                        Label(next.label, systemImage: nextDone ? "bell.fill" : "timer")
                            .font(.headline)
                            .foregroundStyle(Color.brand)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let next {
                        CountdownText(countdown: next, isDone: nextDone)
                            .font(.title2.weight(.semibold))
                            .multilineTextAlignment(.trailing)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.attributes.recipeTitle)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        if let next, !nextDone {
                            ProgressView(timerInterval: next.interval, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(.brand)
                        }
                        IslandOtherTimers(timers: Array(state.timers.dropFirst()))
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Color.brand)
                    .accessibilityLabel(next?.label ?? "Timer")
            } compactTrailing: {
                if let next {
                    // A 48-point slot; the clock stays as everywhere it's the main countdown.
                    CountdownText(countdown: next, isDone: nextDone)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 48)
                        .foregroundStyle(Color.brand)
                }
            } minimal: {
                if let next, !nextDone {
                    ProgressView(timerInterval: next.interval, countsDown: true) { EmptyView() } currentValueLabel: {
                        Image(systemName: "timer")
                    }
                    .progressViewStyle(.circular)
                    .tint(.brand)
                } else {
                    Image(systemName: "bell.fill").foregroundStyle(.orange)
                }
            }
            .keylineTint(.brand)
        }
    }
}

/// Counts down to the timer's end, or says it's done. A countdown stops at
/// 0:00 on its own; "Done" appears whenever the activity is next rendered
/// after that, such as when cook mode reports the finished timer, the alarm
/// is stopped, or the system re-renders at the activity's stale date, which
/// is when the next timer finishes.
private struct CountdownText: View {
    enum Style {
        /// "2:59:11", for the big countdowns.
        case full
        /// "2h 59m" for an hour or more, otherwise "9:36", for the
        /// smaller rows.
        case short
    }

    let countdown: CookTimerAttributes.Countdown
    var style = Style.full
    var isDone: Bool

    var body: some View {
        if isDone {
            Text("Done").foregroundStyle(.orange)
        } else if style == .short, countdown.usesShortFormat(at: .now) {
            Text(.durationOffset(to: countdown.endsAt), format: CookTimerAttributes.Countdown.shortFormat)
        } else {
            Text(timerInterval: countdown.interval, countsDown: true)
                .monospacedDigit()
        }
    }
}

/// The timers under the next one on the Lock Screen, and how many more
/// don't fit there.
private struct OtherTimers: View {
    let timers: [CookTimerAttributes.Countdown]
    let hidden: Int

    var body: some View {
        ForEach(timers) { timer in
            HStack {
                Text(timer.label).foregroundStyle(.secondary).lineLimit(1)
                Spacer()
                CountdownText(countdown: timer, style: .short, isDone: timer.isDone(at: .now))
                    .multilineTextAlignment(.trailing)
                    .fixedSize()
            }
            .font(.subheadline)
        }
        if hidden > 0 {
            Text("+\(hidden) more")
                .font(.subheadline)
                .foregroundStyle(Color.brand)
        }
    }
}

/// The expanded Dynamic Island is only about 160 points tall, so other timers
/// share one line: the next of them, then how many more are running.
private struct IslandOtherTimers: View {
    let timers: [CookTimerAttributes.Countdown]

    var body: some View {
        if let first = timers.first {
            HStack(spacing: 6) {
                Text(first.label)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text("·").foregroundStyle(.tertiary)
                CountdownText(countdown: first, style: .short, isDone: first.isDone(at: .now))
                    .fixedSize()
                Spacer(minLength: 8)
                if timers.count > 1 {
                    Text("+\(timers.count - 1) more")
                        .foregroundStyle(Color.brand)
                        .fixedSize()
                }
            }
            .font(.subheadline)
        }
    }
}

struct CookTimerLockScreenView: View {
    /// Lines left for other timers under the next one. The Lock Screen
    /// presentation is capped at about 160 points, so a fourth timer turns
    /// the second line into "+N more" instead of adding a third.
    static let otherTimerRows = 2

    let title: String
    let state: CookTimerAttributes.ContentState
    var isStale = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Label(title, systemImage: "frying.pan")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.brand)
                    .lineLimit(1)
                Spacer()
            }
            if let next = state.next {
                let done = state.isDone(next, at: .now, isStale: isStale)
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(next.label).font(.headline).lineLimit(1)
                            // Stays right if the countdown sits at 0:00
                            // because nothing re-rendered the activity.
                            Text("Done at \(Text(next.endsAt, style: .time))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        CountdownText(countdown: next, isDone: done)
                            .font(.system(size: 34, weight: .semibold, design: .rounded))
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    if !done {
                        ProgressView(timerInterval: next.interval, countsDown: true) { EmptyView() } currentValueLabel: {
                            Image(systemName: "timer")
                        }
                        .progressViewStyle(.circular)
                        .tint(.brand)
                    } else {
                        Image(systemName: "bell.and.waves.left.and.right.fill")
                            .font(.title)
                            .foregroundStyle(.orange)
                    }
                }
            }
            let others = state.others(rows: Self.otherTimerRows)
            OtherTimers(timers: others.shown, hidden: others.hidden)
        }
    }
}

#Preview("Island, four timers", as: .dynamicIsland(.expanded), using: CookTimerAttributes(recipeTitle: "Oven-Baked Baby Back Ribs")) {
    CookTimerLiveActivity()
} contentStates: {
    CookTimerAttributes.ContentState(timers: [
        .init(id: UUID(), label: "Step 8", startedAt: .now, endsAt: .now.addingTimeInterval(576)),
        .init(id: UUID(), label: "Step 7", startedAt: .now, endsAt: .now.addingTimeInterval(1165)),
        .init(id: UUID(), label: "Step 5", startedAt: .now, endsAt: .now.addingTimeInterval(10751)),
        .init(id: UUID(), label: "Step 12", startedAt: .now, endsAt: .now.addingTimeInterval(14400)),
    ])
}

#Preview("Lock Screen", as: .content, using: CookTimerAttributes(recipeTitle: "Pesto Pasta")) {
    CookTimerLiveActivity()
} contentStates: {
    CookTimerAttributes.ContentState(timers: [
        .init(id: UUID(), label: "Step 2", startedAt: .now, endsAt: .now.addingTimeInterval(600)),
        .init(id: UUID(), label: "Step 4", startedAt: .now, endsAt: .now.addingTimeInterval(1500)),
    ])
}

#Preview("Lock Screen, four timers", as: .content, using: CookTimerAttributes(recipeTitle: "Oven-Baked Baby Back Ribs")) {
    CookTimerLiveActivity()
} contentStates: {
    CookTimerAttributes.ContentState(timers: [
        .init(id: UUID(), label: "Step 8", startedAt: .now, endsAt: .now.addingTimeInterval(576)),
        .init(id: UUID(), label: "Step 5", startedAt: .now, endsAt: .now.addingTimeInterval(10751)),
        .init(id: UUID(), label: "Step 12", startedAt: .now, endsAt: .now.addingTimeInterval(14400)),
        .init(id: UUID(), label: "Step 2", startedAt: .now.addingTimeInterval(-900), endsAt: .now.addingTimeInterval(-60)),
    ])
}
