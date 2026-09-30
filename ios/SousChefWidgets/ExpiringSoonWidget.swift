import SwiftUI
import WidgetKit

/// Food to use up next, with how many days each has left. Opens the Pantry's
/// "Use soon" section, which uses the same window.
struct ExpiringSoonWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ExpiringSoon", provider: KitchenTimelineProvider()) { entry in
            ExpiringSoonView(entry: entry)
                .containerBackground(.background, for: .widget)
                .widgetURL(KitchenLink.useSoon)
        }
        .configurationDisplayName("Use Soon")
        .description("Food in your kitchen that expires next.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct ExpiringSoonView: View {
    let entry: KitchenEntry
    @Environment(\.widgetFamily) private var family

    private var items: [KitchenSnapshot.ExpiringItem] { entry.snapshot?.expiring ?? [] }

    /// Uses the window the app found the items with, which is the cook's
    /// "expiring soon" setting.
    private var emptyText: String {
        guard let snapshot = entry.snapshot else { return "Open Sous Chef to see what's expiring." }
        guard let days = snapshot.expiringWindowDays else { return "Nothing expiring soon." }
        return days == 1 ? "Nothing expiring by tomorrow." : "Nothing expiring in the next \(days) days."
    }

    private var limit: Int {
        switch family {
        case .systemMedium: 4
        case .accessoryRectangular: 2
        default: 3
        }
    }

    var body: some View {
        if family == .accessoryRectangular { accessory } else { system }
    }

    private var system: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Use soon", systemImage: "clock.badge.exclamationmark")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.brand)
                .textCase(.uppercase)
            if items.isEmpty {
                Spacer(minLength: 0)
                Text(emptyText)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(items.prefix(limit)) { item in
                    row(item)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func row(_ item: KitchenSnapshot.ExpiringItem) -> some View {
        HStack(spacing: 6) {
            if family == .systemMedium {
                Image(systemName: StorageSymbol.name(for: item.location))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(width: 18)
                    .accessibilityHidden(true)
            }
            Text(item.name)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(item.dayText(from: entry.date))
                .font(.caption.weight(.semibold).monospacedDigit())
                .foregroundStyle(color(for: item))
                .lineLimit(1)
        }
    }

    private var accessory: some View {
        VStack(alignment: .leading, spacing: 1) {
            Label("Use soon", systemImage: "clock")
                .font(.caption.weight(.semibold))
                .widgetAccentable()
            if items.isEmpty {
                Text("Nothing expiring").foregroundStyle(.secondary)
            } else {
                ForEach(items.prefix(limit)) { item in
                    Text("\(item.name) · \(item.dayText(from: entry.date))").lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func color(for item: KitchenSnapshot.ExpiringItem) -> Color {
        switch item.days(from: entry.date) {
        case ...0: .red
        case 1...5: .orange
        default: .secondary
        }
    }
}

/// Mirrors `StorageLocation.symbol` in the app.
enum StorageSymbol {
    static func name(for location: String) -> String {
        switch location {
        case "fridge": "refrigerator"
        case "freezer": "snowflake"
        default: "cabinet"
        }
    }
}

#Preview(as: .systemMedium) {
    ExpiringSoonWidget()
} timeline: {
    KitchenEntry(date: .now, snapshot: .preview)
    KitchenEntry(date: .now, snapshot: .empty)
}
