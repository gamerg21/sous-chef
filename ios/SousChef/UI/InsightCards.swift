import SwiftUI

/// A card on an at-a-glance pane, grouped like the list beside it.
struct InsightCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 22, style: .continuous))
    }
}

/// A headline number with what it counts. Given an action, it's a filter for
/// the list beside the pane: tapped, it filters; tapped again, it clears.
struct StatTile: View {
    let value: Int
    let title: String
    let systemImage: String
    let tint: Color
    var selected = false
    var action: (() -> Void)?

    var body: some View {
        if let action {
            Button(action: action) { tile }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
                .accessibilityHint(selected ? "Shows everything again" : "Shows only these")
        } else {
            tile
        }
    }

    /// Narrow, as in two columns on the upright iPhone Duo's half, the icon
    /// sits above the number so the title keeps its width.
    @State private var narrow = false

    private var tile: some View {
        let stack = narrow ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
        return stack {
            Image(systemName: systemImage)
                .font((narrow ? Font.body : .title3).weight(.semibold))
                .foregroundStyle(selected ? .white : tint)
                .frame(width: narrow ? 34 : 44, height: narrow ? 34 : 44)
                .background(selected ? AnyShapeStyle(tint) : AnyShapeStyle(tint.opacity(0.14)), in: .rect(cornerRadius: narrow ? 10 : 13, style: .continuous))
                .symbolEffect(.bounce, value: selected)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(value)")
                    .statNumber(size: 28)
                    .contentTransition(.numericText(value: Double(value)))
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            if !narrow { Spacer(minLength: 0) }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: narrow ? .topLeading : .leading)
        .onGeometryChange(for: Bool.self) { $0.size.width < 180 } action: { narrow = $0 }
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(tint, lineWidth: selected ? 2 : 0)
        }
        .contentShape(.rect(cornerRadius: 22, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Tiles side by side, as tall as the tallest, or one above the other once
/// larger text would leave each narrower than `minimumTileWidth` (given at
/// the default text size and scaled with it).
struct TileRow<Content: View>: View {
    var count = 2
    var spacing: CGFloat
    var content: Content

    @ScaledMetric private var minimumTileWidth: CGFloat
    @State private var stacked = false

    init(count: Int = 2, minimumTileWidth: CGFloat = 130, spacing: CGFloat = 14, @ViewBuilder content: () -> Content) {
        self.count = count
        self.spacing = spacing
        self.content = content()
        _minimumTileWidth = ScaledMetric(wrappedValue: minimumTileWidth, relativeTo: .subheadline)
    }

    var body: some View {
        let layout = stacked ? AnyLayout(VStackLayout(spacing: spacing)) : AnyLayout(HStackLayout(spacing: spacing))
        layout { content }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: Bool.self) { proxy in
                (proxy.size.width - spacing * CGFloat(count - 1)) / CGFloat(count) < minimumTileWidth
            } action: { stacked = $0 }
    }
}

/// Lays out chips in rows, wrapping as needed.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(for: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map { $0.width }.max() ?? 0
        let height = rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(for: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private func rows(for width: CGFloat, subviews: Subviews) -> [(indices: [Int], width: CGFloat, height: CGFloat)] {
        var rows: [(indices: [Int], width: CGFloat, height: CGFloat)] = []
        var current: (indices: [Int], width: CGFloat, height: CGFloat) = ([], 0, 0)
        for (index, subview) in subviews.enumerated() {
            let size = subview.sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if needed > width, !current.indices.isEmpty {
                rows.append(current)
                current = ([index], size.width, size.height)
            } else {
                current = (current.indices + [index], needed, max(current.height, size.height))
            }
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}
