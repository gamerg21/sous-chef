import ActivityKit
import SwiftUI
import WidgetKit

/// Cook mode's timers on the Lock Screen and in the Dynamic Island. The
/// countdowns are `Text(timerInterval:)` and `ProgressView(timerInterval:)`,
/// so they tick without the app sending updates.
struct CookTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CookTimerAttributes.self) { context in
            CookTimerLockScreenView(title: context.attributes.recipeTitle, state: context.state)
                .padding()
                .activityBackgroundTint(nil)
                .activitySystemActionForegroundColor(.brand)
        } dynamicIsland: { context in
            let next = context.state.next
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    if let next {
                        Label(next.label, systemImage: next.isDone(at: .now) ? "bell.fill" : "timer")
                            .font(.headline)
                            .foregroundStyle(Color.brand)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let next {
                        CountdownText(countdown: next)
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
                        if let next, !next.isDone(at: .now) {
                            ProgressView(timerInterval: next.interval, countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
                                .tint(.brand)
                        }
                        IslandOtherTimers(timers: Array(context.state.timers.dropFirst()))
                    }
                    .padding(.horizontal, 4)
                }
            } compactLeading: {
                Image(systemName: "timer")
                    .foregroundStyle(Color.brand)
                    .accessibilityLabel(next?.label ?? "Timer")
            } compactTrailing: {
                if let next {
                    CountdownText(countdown: next)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 48)
                        .foregroundStyle(Color.brand)
                }
            } minimal: {
                if let next, !next.isDone(at: .now) {
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
/// after that, such as when cook mode reports the finished timer or the
/// system re-renders at the activity's stale date.
private struct CountdownText: View {
    let countdown: CookTimerAttributes.Countdown

    var body: some View {
        if countdown.isDone(at: .now) {
            Text("Done").foregroundStyle(.orange)
        } else {
            Text(timerInterval: countdown.interval, countsDown: true)
                .monospacedDigit()
        }
    }
}

private struct OtherTimers: View {
    let timers: [CookTimerAttributes.Countdown]

    var body: some View {
        ForEach(timers) { timer in
            HStack {
                Text(timer.label).foregroundStyle(.secondary)
                Spacer()
                CountdownText(countdown: timer)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 80, alignment: .trailing)
            }
            .font(.subheadline)
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
                CountdownText(countdown: first)
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
    let title: String
    let state: CookTimerAttributes.ContentState

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
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(next.label).font(.headline)
                        CountdownText(countdown: next)
                            .font(.system(size: 34, weight: .semibold, design: .rounded))
                            .multilineTextAlignment(.leading)
                    }
                    Spacer()
                    if !next.isDone(at: .now) {
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
            OtherTimers(timers: Array(state.timers.dropFirst().prefix(2)))
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
