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
                        OtherTimers(timers: Array(context.state.timers.dropFirst().prefix(2)))
                    }
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

/// Counts down to the timer's end, or says it's done. Once a timer passes
/// its end the system re-renders (the activity's stale date), so "Done"
/// replaces the zeroed clock.
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

#Preview("Lock Screen", as: .content, using: CookTimerAttributes(recipeTitle: "Pesto Pasta")) {
    CookTimerLiveActivity()
} contentStates: {
    CookTimerAttributes.ContentState(timers: [
        .init(id: UUID(), label: "Step 2", startedAt: .now, endsAt: .now.addingTimeInterval(600)),
        .init(id: UUID(), label: "Step 4", startedAt: .now, endsAt: .now.addingTimeInterval(1500)),
    ])
}
