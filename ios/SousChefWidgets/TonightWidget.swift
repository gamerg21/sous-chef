import SwiftUI
import UIKit
import WidgetKit

/// Tonight's planned meal and whether the pantry is ready for it. Opens the
/// week plan, where the meal can be cooked at its planned servings.
struct TonightWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TonightsMeal", provider: KitchenTimelineProvider()) { entry in
            TonightView(entry: entry)
                .containerBackground(.background, for: .widget)
                .widgetURL(KitchenLink.plan)
        }
        .configurationDisplayName("Tonight's Meal")
        .description("What's planned for tonight and whether you have everything.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

struct TonightView: View {
    let entry: KitchenEntry
    @Environment(\.widgetFamily) private var family

    private var meal: KitchenSnapshot.Meal? { entry.snapshot?.meal(at: entry.date) }

    var body: some View {
        switch family {
        case .accessoryInline: inline
        case .accessoryRectangular: rectangular
        case .systemMedium: medium
        default: small
        }
    }

    // MARK: Home Screen

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                eyebrow
                Spacer(minLength: 4)
                if let meal { photo(meal, side: 36) }
            }
            if let meal {
                Text(meal.recipeName)
                    .font(.headline)
                    .lineLimit(3)
                Spacer(minLength: 0)
                readiness(meal)
            } else {
                Spacer(minLength: 0)
                emptyMessage
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var medium: some View {
        HStack(spacing: 14) {
            if let meal {
                photo(meal, side: 108)
                VStack(alignment: .leading, spacing: 6) {
                    eyebrow
                    Text(meal.recipeName)
                        .font(.headline)
                        .lineLimit(2)
                    if let servings = meal.servings {
                        Text("Serves \(servings)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    HStack {
                        readiness(meal)
                        Spacer(minLength: 4)
                        if let recipe = meal.recipeID {
                            Link(destination: KitchenLink.recipe(recipe)) {
                                Label("Recipe", systemImage: "book.pages")
                                    .font(.caption.weight(.semibold))
                            }
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    eyebrow
                    Spacer(minLength: 0)
                    emptyMessage
                    Spacer(minLength: 0)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var eyebrow: some View {
        Label(heading, systemImage: meal?.slotSymbol ?? "fork.knife")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.brand)
            .textCase(.uppercase)
            .lineLimit(1)
    }

    /// "Tonight" for dinner, otherwise the meal, such as "Lunch".
    private var heading: String {
        guard let meal, meal.slot != "dinner" else { return "Tonight" }
        return meal.slotTitle
    }

    @ViewBuilder
    private var emptyMessage: some View {
        if entry.snapshot == nil {
            Text("Open Sous Chef to see tonight's meal.")
                .font(.callout)
                .foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Nothing planned")
                    .font(.headline)
                Label("Plan a meal", systemImage: "calendar.badge.plus")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.brand)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func readiness(_ meal: KitchenSnapshot.Meal) -> some View {
        Label(meal.readiness, systemImage: meal.missing == 0 ? "checkmark.seal.fill" : "cart")
            .font(.caption.weight(.semibold))
            .foregroundStyle(meal.missing == 0 ? .green : .orange)
            .lineLimit(1)
    }

    @ViewBuilder
    private func photo(_ meal: KitchenSnapshot.Meal, side: CGFloat) -> some View {
        let corner: CGFloat = side > 60 ? 16 : 10
        Group {
            if let name = meal.photo, let url = KitchenSnapshot.photoURL(named: name), let image = UIImage(contentsOfFile: url.path()) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                Image(systemName: "frying.pan")
                    .font(side > 60 ? .title : .callout)
                    .foregroundStyle(Color.brand)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.brand.opacity(0.12))
            }
        }
        .frame(width: side, height: side)
        .clipShape(.rect(cornerRadius: corner, style: .continuous))
        .accessibilityHidden(true)
    }

    // MARK: Lock Screen

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            Label(meal.map { "\(heading) · \($0.readiness)" } ?? "Tonight", systemImage: meal?.slotSymbol ?? "fork.knife")
                .font(.caption.weight(.semibold))
                .widgetAccentable()
            if let meal {
                Text(meal.recipeName).lineLimit(2)
            } else {
                Text("Nothing planned").foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inline: some View {
        Label(meal.map { "\($0.recipeName) · \($0.readiness)" } ?? "Nothing planned", systemImage: "fork.knife")
    }
}

#Preview(as: .systemSmall) {
    TonightWidget()
} timeline: {
    KitchenEntry(date: .now, snapshot: .preview)
    KitchenEntry(date: .now, snapshot: .empty)
}

#Preview(as: .systemMedium) {
    TonightWidget()
} timeline: {
    KitchenEntry(date: .now, snapshot: .preview)
    KitchenEntry(date: .now, snapshot: .empty)
}
