import SwiftUI

/// The recipe library at a glance, beside it on an unfolded iPhone Duo (or
/// any wide screen). Every number is a filter for the library: tap one to
/// show just those recipes, and tap it again to show them all.
struct RecipeInsightsPane: View {
    let stats: RecipeStats
    let recipes: [Recipe]
    @Binding var filter: RecipesView.Filter
    @Binding var period: RecipeStats.Period
    /// Opens a recipe in the library beside the pane.
    var onOpen: (Recipe) -> Void

    private var byID: [UUID: Recipe] {
        Dictionary(recipes.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    readyCard
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 14) {
                        tile(stats.almost.count, "almost there", "cart", .orange, .almost)
                        tile(stats.expiring.count, "use food expiring soon", "hourglass", .red, .expiring)
                        tile(stats.quick.count, "ready in \(RecipeStats.quickMinutes) min", "timer", .blue, .quick)
                        tile(recipes.filter(\.favorited).count, "favorites", "heart.fill", .pink, .favorites)
                    }
                    popularCard
                    if !stats.recent.isEmpty { newCard }
                    if !stats.tags.isEmpty { tagsCard }
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
                .animation(.snappy, value: filter)
            }
            .scrollIndicators(.hidden)
            .background(Color(.systemGroupedBackground))
            .ignoresRailInset()
            .navigationTitle("At a Glance")
        }
    }

    private func toggle(_ value: RecipesView.Filter) {
        withAnimation(.snappy) { filter = filter == value ? .all : value }
    }

    private func tile(_ value: Int, _ title: String, _ symbol: String, _ tint: Color, _ target: RecipesView.Filter) -> some View {
        StatTile(value: value, title: title, systemImage: symbol, tint: tint, selected: filter == target) { toggle(target) }
    }

    // MARK: Ready to cook

    private var readyCard: some View {
        let ready = stats.ready.count
        let almost = stats.almost.count
        let total = max(1, recipes.count)
        let selected = filter == .ready
        return Button { toggle(.ready) } label: {
            InsightCard {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(ready)")
                        .font(.system(size: 44, weight: .bold, design: .rounded).monospacedDigit())
                        .contentTransition(.numericText(value: Double(ready)))
                    Text(ready == 1 ? "recipe ready to cook" : "recipes ready to cook")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Image(systemName: selected ? "checkmark.circle.fill" : "chevron.right.circle")
                        .font(.title3)
                        .foregroundStyle(Color.brand)
                        .contentTransition(.symbolEffect(.replace))
                }
                // Ready, almost there and the rest, with gaps between them.
                GeometryReader { proxy in
                    let parts = [(ready, Color.brand), (almost, Color.orange), (recipes.count - ready - almost, Color(.systemGray4))].filter { $0.0 > 0 }
                    let gaps = CGFloat(max(0, parts.count - 1)) * 3
                    HStack(spacing: 3) {
                        ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                            Capsule()
                                .fill(part.1)
                                .frame(width: max(8, (proxy.size.width - gaps) * CGFloat(part.0) / CGFloat(total)))
                        }
                    }
                }
                .frame(height: 12)
                .accessibilityHidden(true)
                Text("Your pantry covers every ingredient. \(recipes.count) recipes in all.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.brand, lineWidth: selected ? 2 : 0)
            }
            .contentShape(.rect(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .accessibilityHint(selected ? "Shows every recipe again" : "Shows only recipes you can cook now")
    }

    // MARK: Popular

    private var popularCard: some View {
        let top = stats.popular.prefix(3).compactMap { entry in byID[entry.id].map { ($0, entry.count) } }
        let selected = filter == .popular
        return InsightCard {
            HStack {
                Eyebrow("Popular", systemImage: "flame")
                Spacer()
                Picker("Period", selection: $period) {
                    ForEach(RecipeStats.Period.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            if top.isEmpty {
                Text("Plan or cook a recipe and it shows up here.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(top.enumerated()), id: \.element.0.uuid) { index, item in
                        if index > 0 { Divider().padding(.leading, 64) }
                        Button { onOpen(item.0) } label: {
                            HStack(spacing: 12) {
                                Text("\(index + 1)")
                                    .font(.system(.headline, design: .rounded).monospacedDigit())
                                    .foregroundStyle(.secondary)
                                    .frame(width: 14)
                                RecipeImage(data: item.0.photo, maxPixel: 200)
                                    .frame(width: 38, height: 38)
                                    .clipShape(.rect(cornerRadius: 10, style: .continuous))
                                Text(item.0.title)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                                Text("\(item.1)×")
                                    .font(.subheadline.weight(.semibold).monospacedDigit())
                                    .foregroundStyle(.secondary)
                                    .accessibilityLabel("\(item.1) times")
                            }
                            .padding(.vertical, 7)
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
                filterButton(selected ? "Showing popular recipes" : "Show all \(stats.popular.count) popular", selected: selected) { toggle(.popular) }
            }
        }
    }

    // MARK: New

    private var newCard: some View {
        let selected = filter == .recent
        return Button { toggle(.recent) } label: {
            InsightCard {
                HStack {
                    Eyebrow("Newly added", systemImage: "sparkles")
                    Spacer()
                    Text("Last \(RecipeStats.newDays) days")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 12) {
                    Text("\(stats.recent.count)")
                        .font(.system(size: 32, weight: .bold, design: .rounded).monospacedDigit())
                    // Their photos, overlapping like a fanned hand of cards.
                    HStack(spacing: -12) {
                        ForEach(stats.recent.prefix(5).compactMap { byID[$0] }, id: \.uuid) { recipe in
                            RecipeImage(data: recipe.photo, maxPixel: 200)
                                .frame(width: 40, height: 40)
                                .clipShape(Circle())
                                .overlay(Circle().strokeBorder(Color(.secondarySystemGroupedBackground), lineWidth: 2.5))
                        }
                    }
                    .accessibilityHidden(true)
                    Spacer(minLength: 0)
                    Image(systemName: selected ? "checkmark.circle.fill" : "chevron.right.circle")
                        .font(.title3)
                        .foregroundStyle(Color.brand)
                        .contentTransition(.symbolEffect(.replace))
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.brand, lineWidth: selected ? 2 : 0)
            }
            .contentShape(.rect(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(stats.recent.count) newly added recipes")
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: Tags

    private var tagsCard: some View {
        InsightCard {
            Eyebrow("By tag", systemImage: "number")
            FlowLayout(spacing: 8) {
                ForEach(stats.tags.prefix(12), id: \.tag) { tag in
                    let selected = filter == .tag(tag.tag)
                    Button { toggle(.tag(tag.tag)) } label: {
                        HStack(spacing: 5) {
                            Text(tag.tag)
                            Text("\(tag.count)")
                                .foregroundStyle(selected ? Color.white.opacity(0.8) : Color.secondary)
                                .monospacedDigit()
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .foregroundStyle(selected ? Color.white : Color.brand)
                        .background(selected ? Color.brand : Color.brandSoft, in: .capsule)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
    }

    private func filterButton(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: selected ? "checkmark" : "line.3.horizontal.decrease")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.glass)
        .tint(Color.brand)
        .controlSize(.small)
    }
}
