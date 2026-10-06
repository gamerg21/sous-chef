import ActivityKit
import AlarmKit
import SwiftUI
import WidgetKit

/// A cook timer's alarm while it rings, on the Lock Screen and in the Dynamic
/// Island. AlarmKit presents a ringing alarm as a Live Activity drawn by the
/// app's widget extension, so this view has to exist for the alarm to show
/// and sound at all. The countdown before then is `CookTimerLiveActivity`.
struct CookTimerAlarmLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<CookTimerAlarmMetadata>.self) { context in
            HStack(spacing: 12) {
                Image(systemName: "bell.and.waves.left.and.right.fill")
                    .font(.title)
                    .foregroundStyle(.orange)
                    .symbolEffect(.wiggle)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.presentation.alert.title).font(.headline)
                    if let recipe = context.attributes.metadata?.recipeTitle {
                        Text(recipe).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer()
            }
            .padding()
            .activityBackgroundTint(nil)
            .activitySystemActionForegroundColor(.brand)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "bell.and.waves.left.and.right.fill")
                        .font(.title2)
                        .foregroundStyle(.orange)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.presentation.alert.title)
                        .font(.headline)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let recipe = context.attributes.metadata?.recipeTitle {
                        Text(recipe).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: "bell.fill").foregroundStyle(.orange)
            } compactTrailing: {
                Text("Done").foregroundStyle(.orange)
            } minimal: {
                Image(systemName: "bell.fill").foregroundStyle(.orange)
            }
            .keylineTint(.orange)
        }
    }
}
