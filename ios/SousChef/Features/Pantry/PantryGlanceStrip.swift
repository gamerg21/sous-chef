import SwiftData
import SwiftUI

/// The kitchen at a glance across the top of the Pantry list, on the
/// unfolded iPhone Duo held upright and open flat, where the list has the
/// whole screen: four numbers from the at-a-glance pane, then the three
/// places. It scrolls away with the list. "Use soon" and the places filter
/// the list; how many recipes are ready and how fresh things are just say
/// so. "See all" opens the whole pane.
struct PantryGlanceStrip: View {
    let items: [PantryItem]
    let windowDays: Int
    @Binding var filter: PantryFilter
    var seeAll: () -> Void

    @Query private var recipes: [Recipe]

    private var inStock: [PantryItem] { items.filter { $0.quantity > 0 } }

    var body: some View {
        VStack(spacing: 10) {
            // Four across, two by two once larger text won't fit four, then
            // one under another.
            TileRow(count: 2, minimumTileWidth: 250, spacing: 10) {
                TileRow(count: 2, minimumTileWidth: 120, spacing: 10) {
                    inStockTile
                    useSoonTile
                }
                TileRow(count: 2, minimumTileWidth: 120, spacing: 10) {
                    readyTile
                    freshTile
                }
            }
            LocationTiles(
                counts: StorageLocation.allCases.map { location in (location, inStock.filter { $0.location == location }.count) },
                scope: $filter.scope,
                tileBackground: Color(.secondarySystemGroupedBackground)
            )
        }
    }

    /// Over the strip, as a section header.
    static func header(seeAll: @escaping () -> Void) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Eyebrow("At a glance", systemImage: "square.grid.2x2")
            Spacer()
            Button(action: seeAll) {
                HStack(spacing: 3) {
                    Text("See all")
                    Image(systemName: "chevron.forward").imageScale(.small)
                }
                .font(.subheadline.weight(.semibold))
            }
            .textCase(nil)
            .accessibilityLabel("See all at a glance")
            .accessibilityIdentifier("pantryGlanceSeeAll")
        }
    }

    private var inStockTile: some View {
        StatTile(value: inStock.count, title: "in stock", systemImage: "basket", tint: .brand, compact: true)
            .accessibilityIdentifier("pantryGlance-inStock")
    }

    private var useSoonTile: some View {
        let count = ExpiringFood.find(in: inStock.map(\.expiringStock), within: windowDays).count
        let on = filter.isOn(.useSoon)
        return StatTile(
            value: count,
            title: "to use soon",
            systemImage: count == 0 ? "leaf" : "clock.badge.exclamationmark",
            tint: count == 0 && !on ? .brand : .orange,
            selected: on,
            compact: true
        ) {
            withAnimation(.snappy) { filter.toggle(.useSoon) }
        }
        .accessibilityIdentifier("pantryGlance-useSoon")
    }

    private var readyTile: some View {
        let count = PantryInsightsPane.ready(recipes, from: items).count
        return StatTile(value: count, title: count == 1 ? "recipe ready" : "recipes ready", systemImage: "frying.pan", tint: .brand, compact: true)
            .accessibilityIdentifier("pantryGlance-ready")
    }

    @ViewBuilder private var freshTile: some View {
        if let share = PantryInsightsPane.freshShare(of: items, window: windowDays) {
            StatTile(value: share, title: "fresh", systemImage: "leaf", tint: share >= 50 ? .brand : .orange, unit: "%", compact: true)
                .accessibilityIdentifier("pantryGlance-fresh")
        } else {
            // Nothing dated yet, so nothing to rate.
            StatTile(value: inStock.filter { $0.expiresOn == nil }.count, title: "without a date", systemImage: "calendar.badge.minus", tint: .secondary, compact: true)
                .accessibilityIdentifier("pantryGlance-fresh")
        }
    }
}
