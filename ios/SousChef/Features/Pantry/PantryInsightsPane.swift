import Charts
import SwiftData
import SwiftUI

/// The kitchen at a glance, beside the pantry list on an unfolded iPhone Duo
/// (or any wide screen): where things are, what's going off, what it adds up
/// to, and what can be cooked from it.
struct PantryInsightsPane: View {
    @Environment(\.isStackedPane) private var isStacked
    let items: [PantryItem]
    let outcomes: [PantryOutcome]
    let windowDays: Int
    /// The list's location filter; the location bar sets it.
    @Binding var scope: PantryView.LocationScope
    var onSelect: (PantryItem) -> Void

    @Query private var recipes: [Recipe]
    /// The narrowest a food's name gets before its days left move below it.
    @ScaledMetric(relativeTo: .body) private var rowNameWidth: CGFloat = 120
    @ScaledMetric(relativeTo: .subheadline) private var legendWidth: CGFloat = 120
    @ScaledMetric(relativeTo: .caption) private var categoryRowHeight: CGFloat = 30

    private var inStock: [PantryItem] { items.filter { $0.quantity > 0 } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    // Across the top, so its three places keep their names.
                    locationsCard
                    PaneCards(columns: isStacked) {
                        TileRow {
                            useSoonTile
                            readyTile
                        }
                        freshnessCard
                    } trailing: {
                        if !expiring.isEmpty { useSoonCard }
                        if categories.count > 1 { categoriesCard }
                        monthCard
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            // Grouped like the list beside it, so the halves read as one screen.
            .background(Color(.systemGroupedBackground))
            .ignoresRailInset()
            .navigationTitle("At a Glance")
            .paneTitleDisplayMode(isStacked)
        }
    }

    // MARK: Locations

    private var locationsCard: some View {
        let counts = StorageLocation.allCases.map { location in (location, inStock.filter { $0.location == location }.count) }
        let total = max(1, counts.reduce(0) { $0 + $1.1 })
        return InsightCard {
            AdaptiveStack(alignment: .firstTextBaseline, spacing: 6, verticalSpacing: 0) {
                Text("\(inStock.count)")
                    .statNumber(size: 44)
                    .contentTransition(.numericText(value: Double(inStock.count)))
                Text(inStock.count == 1 ? "item in stock" : "items in stock")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            // Stacked by location, with gaps so neighbors never blur together.
            GeometryReader { proxy in
                let gaps = CGFloat(max(0, counts.filter { $0.1 > 0 }.count - 1)) * 3
                HStack(spacing: 3) {
                    ForEach(counts.filter { $0.1 > 0 }, id: \.0) { location, count in
                        Capsule()
                            .fill(location.tint)
                            .frame(width: max(8, (proxy.size.width - gaps) * CGFloat(count) / CGFloat(total)))
                            .opacity(scope == .all || scope == .location(location) ? 1 : 0.3)
                    }
                }
            }
            .frame(height: 12)
            .accessibilityHidden(true)
            // Three across while their names fit, else one under another.
            TileRow(count: 3, minimumTileWidth: 90, spacing: 8) {
                ForEach(counts, id: \.0) { location, count in
                    let selected = scope == .location(location)
                    Button {
                        withAnimation(.snappy) { scope = selected ? .all : .location(location) }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: location.symbol)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(location.tint)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 0) {
                                Text("\(count)")
                                    .font(.headline.monospacedDigit())
                                    .contentTransition(.numericText(value: Double(count)))
                                Text(location.title)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(selected ? location.tint.opacity(0.16) : Color(.systemGroupedBackground), in: .rect(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(selected ? location.tint : .clear, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(count) in \(location.title)")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityHint("Shows only the \(location.title.lowercased()) in the list")
                }
            }
        }
    }

    // MARK: Tiles

    private var expiring: [ExpiringFood] {
        ExpiringFood.find(in: inStock.map(\.expiringStock), within: windowDays)
    }

    private var useSoonTile: some View {
        let count = expiring.count
        return StatTile(
            value: count,
            title: "to use soon",
            systemImage: count == 0 ? "leaf" : "clock.badge.exclamationmark",
            tint: count == 0 ? .brand : .orange
        )
    }

    /// Recipes the pantry covers right now.
    private var ready: [Recipe] {
        let stock = items.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
        return recipes
            .filter { !$0.ingredients.isEmpty && CookingPlanner.plan(ingredients: $0.ingredients, stock: stock).missingIngredients.isEmpty }
            .sorted { $0.title < $1.title }
    }

    private var readyTile: some View {
        let ready = ready
        return StatTile(
            value: ready.count,
            title: ready.count == 1 ? "recipe ready" : "recipes ready",
            systemImage: "frying.pan",
            tint: .brand
        )
    }

    // MARK: Freshness

    private enum Freshness: CaseIterable {
        case expired, soon, fresh, undated

        var title: String {
            switch self {
            case .expired: "Past date"
            case .soon: "Use soon"
            case .fresh: "Fresh"
            case .undated: "No date"
            }
        }
        var symbol: String {
            switch self {
            case .expired: "exclamationmark.octagon.fill"
            case .soon: "clock.fill"
            case .fresh: "checkmark.circle.fill"
            case .undated: "calendar.badge.minus"
            }
        }
        var tint: Color {
            switch self {
            case .expired: .red
            case .soon: .orange
            case .fresh: .brand
            case .undated: Color(.systemGray3)
            }
        }
    }

    private func freshness(of item: PantryItem) -> Freshness {
        guard let date = item.expiresOn else { return .undated }
        let days = ExpiringFood.daysLeft(until: date, from: .now)
        return days < 0 ? .expired : days <= windowDays ? .soon : .fresh
    }

    private var freshnessCard: some View {
        let counts = Freshness.allCases.map { kind in (kind, inStock.filter { freshness(of: $0) == kind }.count) }
        let total = max(1, inStock.count)
        let dated = inStock.filter { $0.expiresOn != nil }.count
        let freshShare = dated == 0 ? 0 : Int((Double(counts.first { $0.0 == .fresh }?.1 ?? 0) / Double(dated) * 100).rounded())
        return InsightCard {
            AdaptiveStack(alignment: .firstTextBaseline, verticalSpacing: 4) {
                Eyebrow("Freshness", systemImage: "leaf")
                    .frame(maxWidth: .infinity, alignment: .leading)
                if dated > 0 {
                    Text("\(freshShare)% fresh")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            GeometryReader { proxy in
                let shown = counts.filter { $0.1 > 0 }
                let gaps = CGFloat(max(0, shown.count - 1)) * 3
                HStack(spacing: 3) {
                    ForEach(shown, id: \.0) { kind, count in
                        Capsule()
                            .fill(kind.tint)
                            .frame(width: max(8, (proxy.size.width - gaps) * CGFloat(count) / CGFloat(total)))
                    }
                }
            }
            .frame(height: 12)
            .accessibilityHidden(true)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: legendWidth), alignment: .leading)], alignment: .leading, spacing: 8) {
                ForEach(counts, id: \.0) { kind, count in
                    Label {
                        HStack(spacing: 4) {
                            Text(kind.title).foregroundStyle(.secondary)
                            Text("\(count)").fontWeight(.semibold).monospacedDigit()
                        }
                    } icon: {
                        Image(systemName: kind.symbol).foregroundStyle(kind.tint)
                    }
                    .font(.subheadline)
                }
            }
        }
    }

    // MARK: Use soon

    private var useSoonCard: some View {
        let byID = Dictionary(items.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        return InsightCard {
            Eyebrow("Use soon", systemImage: "clock.badge.exclamationmark")
            VStack(spacing: 0) {
                ForEach(Array(expiring.prefix(5).enumerated()), id: \.element.id) { index, food in
                    if index > 0 { Divider().padding(.leading, 40) }
                    Button {
                        if let item = byID[food.id] { onSelect(item) }
                    } label: {
                        HStack(spacing: 12) {
                            DaysLeftDial(daysLeft: food.daysLeft, window: windowDays)
                            TrailingDetailLayout(minimumLeadingWidth: rowNameWidth, spacing: 2) {
                                Text(food.name)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(daysText(food.daysLeft))
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(food.daysLeft < 0 ? .red : food.daysLeft <= 1 ? .orange : .secondary)
                            }
                        }
                        .padding(.vertical, 8)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func daysText(_ days: Int) -> String {
        switch days {
        case ..<0: "\(-days)d ago"
        case 0: "Today"
        case 1: "Tomorrow"
        default: "\(days) days"
        }
    }

    // MARK: Categories

    private var categories: [(name: String, count: Int)] {
        let grouped = Dictionary(grouping: inStock) { $0.category?.nilIfEmpty ?? "Other" }
        let sorted = grouped.map { (name: $0.key, count: $0.value.count) }.sorted { ($0.count, $1.name) > ($1.count, $0.name) }
        guard sorted.count > 5 else { return sorted }
        let rest = sorted.dropFirst(4).reduce(0) { $0 + $1.count }
        return Array(sorted.prefix(4)) + [(name: "Everything else", count: rest)]
    }

    private var categoriesCard: some View {
        let categories = categories
        return InsightCard {
            Eyebrow("What's in stock", systemImage: "square.grid.2x2")
            Chart(categories, id: \.name) { category in
                BarMark(x: .value("Items", category.count), y: .value("Category", category.name), height: .fixed(14))
                    .foregroundStyle(Color.brand.gradient)
                    .clipShape(.rect(cornerRadius: 4))
                    .annotation(position: .trailing, spacing: 6) {
                        Text("\(category.count)")
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks { _ in
                    AxisValueLabel().font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(height: CGFloat(categories.count) * categoryRowHeight)
        }
    }

    // MARK: This month

    private var monthCard: some View {
        let tally = PantryOutcome.tally(outcomes, month: PantryOutcome.month())
        let total = tally.used + tally.wasted
        let usedShare = total == 0 ? 0 : Double(tally.used) / Double(total)
        return InsightCard {
            AdaptiveStack(alignment: .firstTextBaseline, verticalSpacing: 4) {
                Eyebrow(Date.now.formatted(.dateTime.month(.wide)), systemImage: "chart.bar")
                    .frame(maxWidth: .infinity, alignment: .leading)
                if total > 0 {
                    Text("\(Int((usedShare * 100).rounded()))% used up")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
            if total == 0 {
                Text("Finish or toss something and it's counted here, so you can see how little goes to waste.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                AdaptiveStack(spacing: 20, verticalSpacing: 8) {
                    Label { Text("\(tally.used) used").monospacedDigit() } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.brand)
                    }
                    Label { Text("\(tally.wasted) thrown away").monospacedDigit() } icon: {
                        Image(systemName: "xmark.bin.fill").foregroundStyle(.red)
                    }
                }
                .font(.subheadline.weight(.medium))
                GeometryReader { proxy in
                    HStack(spacing: 3) {
                        if tally.used > 0 {
                            Capsule().fill(Color.brand).frame(width: max(8, (proxy.size.width - 3) * usedShare))
                        }
                        if tally.wasted > 0 {
                            Capsule().fill(.red)
                        }
                    }
                }
                .frame(height: 10)
                .accessibilityHidden(true)
            }
        }
    }
}

extension StorageLocation {
    /// Identity colors for the at-a-glance charts, checked for color-blind
    /// separation in light and dark.
    var tint: Color {
        switch self {
        case .pantry: Color(light: 0xD97706, dark: 0xC27A0A)
        case .fridge: Color(light: 0x009966, dark: 0x0E9E6E)
        case .freezer: Color(light: 0x2563EB, dark: 0x4F8FEA)
        }
    }
}

private extension Color {
    init(light: UInt32, dark: UInt32) {
        func color(_ hex: UInt32) -> UIColor {
            UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
        }
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? color(dark) : color(light) })
    }
}

/// How much of the "use soon" window is left, as a little ring.
private struct DaysLeftDial: View {
    let daysLeft: Int
    let window: Int

    var body: some View {
        let tint: Color = daysLeft < 0 ? .red : .orange
        let remaining = daysLeft < 0 ? 1 : max(0.08, Double(daysLeft + 1) / Double(max(1, window) + 1))
        ZStack {
            Circle().stroke(tint.opacity(0.2), lineWidth: 4)
            Circle()
                .trim(from: 0, to: remaining)
                .stroke(tint, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 26, height: 26)
        .accessibilityHidden(true)
    }
}
