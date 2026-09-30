import SwiftUI
import WidgetKit

/// How much is left to buy and the first few items. Opens the Shopping tab.
struct ShoppingListWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ShoppingList", provider: KitchenTimelineProvider()) { entry in
            ShoppingListView(entry: entry)
                .containerBackground(.background, for: .widget)
                .widgetURL(KitchenLink.shopping)
        }
        .configurationDisplayName("Shopping List")
        .description("What's left to buy.")
        .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}

struct ShoppingListView: View {
    let entry: KitchenEntry
    @Environment(\.widgetFamily) private var family

    private var shopping: KitchenSnapshot.ShoppingSummary { entry.snapshot?.shopping ?? .init() }

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(shopping.openCount == 0 ? "List is clear" : "\(shopping.openCount) to buy", systemImage: "cart")
        case .accessoryCircular:
            circular
        case .accessoryRectangular:
            rectangular
        default:
            small
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Shopping", systemImage: "cart")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.brand)
                .textCase(.uppercase)
            Text(shopping.openCount, format: .number)
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
                .accessibilityLabel("\(shopping.openCount) to buy")
            if shopping.openCount == 0 {
                Text("Nothing to buy").font(.caption).foregroundStyle(.secondary)
            } else {
                Text(shopping.names.prefix(3).joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            Label("Shopping · \(shopping.openCount)", systemImage: "cart")
                .font(.caption.weight(.semibold))
                .widgetAccentable()
            if shopping.openCount == 0 {
                Text("Nothing to buy").foregroundStyle(.secondary)
            } else {
                Text(shopping.names.prefix(3).joined(separator: ", ")).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Image(systemName: "cart").font(.caption).widgetAccentable()
                Text(shopping.openCount, format: .number).font(.title3.weight(.semibold).monospacedDigit())
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(shopping.openCount) to buy")
    }
}

#Preview(as: .systemSmall) {
    ShoppingListWidget()
} timeline: {
    KitchenEntry(date: .now, snapshot: .preview)
    KitchenEntry(date: .now, snapshot: .empty)
}
