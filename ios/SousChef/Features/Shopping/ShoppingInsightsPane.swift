import SwiftData
import SwiftUI

/// The shopping list at a glance, beside it on an unfolded iPhone Duo (or any
/// wide screen): how the trip is going, what each aisle holds (tap one to
/// show just that aisle), what the week's meals still need, and which
/// recipes this list makes cookable.
struct ShoppingInsightsPane: View {
    let items: [ShoppingItem]
    /// The list's aisle filter; the aisle rows set it.
    @Binding var aisle: String?

    @Environment(Kitchen.self) private var kitchen
    @Query private var recipes: [Recipe]
    @Query private var pantry: [PantryItem]
    @Query private var meals: [PlannedMeal]
    @State private var toast: String?

    private var open: [ShoppingItem] { items.filter { !$0.checked } }
    private var inCart: [ShoppingItem] { items.filter(\.checked) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    tripCard
                    if !open.isEmpty { aislesCard }
                    planCard
                    unlocksCard
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
                .animation(.snappy, value: aisle)
            }
            .scrollIndicators(.hidden)
            .background(Color(.systemGroupedBackground))
            .ignoresRailInset()
            .navigationTitle("At a Glance")
            .overlay(alignment: .top) {
                if let toast {
                    Label(toast, systemImage: "checkmark.circle.fill")
                        .font(.callout.weight(.medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .glassEffect(.regular, in: .capsule)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, 8)
                }
            }
        }
    }

    // MARK: The trip

    /// "4 of 11 in the cart", filling up as items are checked off.
    private var tripCard: some View {
        let total = items.count
        let done = inCart.count
        let fraction = total == 0 ? 0 : Double(done) / Double(total)
        return InsightCard {
            HStack(spacing: 16) {
                ZStack {
                    Circle().stroke(Color.brand.opacity(0.15), lineWidth: 10)
                    Circle()
                        .trim(from: 0, to: fraction)
                        .stroke(Color.brand, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Image(systemName: done == total && total > 0 ? "checkmark" : "cart.fill")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Color.brand)
                        .contentTransition(.symbolEffect(.replace))
                }
                .frame(width: 72, height: 72)
                .animation(.smooth, value: fraction)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(done)")
                            .font(.system(size: 40, weight: .bold, design: .rounded).monospacedDigit())
                            .contentTransition(.numericText(value: Double(done)))
                        Text("of \(total) in the cart")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                    }
                    Text(total == 0 ? "Your list is empty." : done == total ? "Everything's in the cart. Put it away when you're home." : "\(total - done) still to find.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: Aisles

    private var aislesCard: some View {
        let grouped = Dictionary(grouping: open) { $0.category ?? "Other" }
        let order = ShoppingCategories.all
        let aisles = grouped.keys.sorted { (order.firstIndex(of: $0) ?? 99, $0) < (order.firstIndex(of: $1) ?? 99, $1) }
        let most = grouped.values.map(\.count).max() ?? 1
        return InsightCard {
            HStack {
                Eyebrow("By aisle", systemImage: "square.grid.2x2")
                Spacer()
                if aisle != nil {
                    Button("Show all") { withAnimation(.snappy) { aisle = nil } }
                        .font(.subheadline.weight(.semibold))
                }
            }
            VStack(spacing: 4) {
                ForEach(aisles, id: \.self) { name in
                    let count = grouped[name]?.count ?? 0
                    let selected = aisle == name
                    Button {
                        withAnimation(.snappy) { aisle = selected ? nil : name }
                    } label: {
                        HStack(spacing: 10) {
                            Image(systemName: CategoryStyle.symbol(for: name, name: ""))
                                .font(.subheadline)
                                .foregroundStyle(selected ? .white : Color.brand)
                                .frame(width: 30, height: 30)
                                .background(selected ? AnyShapeStyle(Color.brand) : AnyShapeStyle(Color.brandSoft), in: .rect(cornerRadius: 9, style: .continuous))
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(name).font(.subheadline.weight(.medium)).foregroundStyle(.primary)
                                    Spacer()
                                    Text("\(count)").font(.subheadline.weight(.semibold).monospacedDigit()).foregroundStyle(.secondary)
                                }
                                GeometryReader { proxy in
                                    Capsule()
                                        .fill(Color.brand.opacity(selected ? 1 : 0.55))
                                        .frame(width: max(6, proxy.size.width * CGFloat(count) / CGFloat(most)))
                                }
                                .frame(height: 5)
                            }
                        }
                        .padding(.vertical, 5)
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(name), \(count) item\(count == 1 ? "" : "s")")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityHint(selected ? "Shows the whole list again" : "Shows only this aisle")
                }
            }
        }
    }

    // MARK: The week's meals

    private var planCard: some View {
        let weekStart = MealPlanner.weekStart()
        let forPlan = open.filter { $0.source == .mealPlan }.count
        let short = kitchen.weekShortages(from: weekStart).missingIngredients
        let notListed = short.filter { need in !open.contains { normalizeName($0.name) == normalizeName(need.name) } }
        let planned = meals.filter { $0.day >= weekStart && $0.day < MealPlanner.day(weekStart, adding: 7) && !$0.isCooked }.count
        return InsightCard {
            Eyebrow("This week's meals", systemImage: "calendar")
            HStack(spacing: 14) {
                metric(planned, planned == 1 ? "meal to cook" : "meals to cook")
                Divider().frame(height: 40)
                metric(forPlan, forPlan == 1 ? "item for them" : "items for them")
            }
            if notListed.isEmpty {
                Label(planned == 0 ? "Plan meals in Cook to shop for them here." : "Your list covers the week.", systemImage: planned == 0 ? "calendar.badge.plus" : "checkmark.circle.fill")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(planned == 0 ? Color.secondary : Color.brand)
            } else {
                Button {
                    let result = kitchen.addWeekShortages(from: weekStart)
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    show("Added \(result.added), topped up \(result.updated)")
                } label: {
                    Label("Add \(notListed.count) missing for the week", systemImage: "cart.badge.plus")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.glassProminent)
                .controlSize(.small)
            }
        }
    }

    // MARK: What this list unlocks

    /// Recipes that buying everything on the list would make cookable.
    private var unlocked: [Recipe] {
        let stock = pantry.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
        let bought = stock + items.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity ?? 1, unit: $0.unit ?? "each", expiresOn: nil) }
        return recipes.filter { recipe in
            let ingredients = recipe.ingredients
            guard !ingredients.isEmpty, !CookingPlanner.plan(ingredients: ingredients, stock: stock).missingIngredients.isEmpty else { return false }
            return CookingPlanner.plan(ingredients: ingredients, stock: bought).missingIngredients.isEmpty
        }
        .sorted { $0.title < $1.title }
    }

    private var unlocksCard: some View {
        let unlocked = unlocked
        return InsightCard {
            Eyebrow("This list unlocks", systemImage: "lock.open")
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(unlocked.count)")
                    .font(.system(size: 32, weight: .bold, design: .rounded).monospacedDigit())
                    .contentTransition(.numericText(value: Double(unlocked.count)))
                Text(unlocked.count == 1 ? "more recipe to cook" : "more recipes to cook")
                    .font(.headline)
                    .foregroundStyle(.secondary)
            }
            if !unlocked.isEmpty {
                VStack(spacing: 8) {
                    ForEach(unlocked.prefix(4), id: \.uuid) { recipe in
                        HStack(spacing: 10) {
                            RecipeImage(data: recipe.photo, maxPixel: 200)
                                .frame(width: 34, height: 34)
                                .clipShape(.rect(cornerRadius: 9, style: .continuous))
                            Text(recipe.title).font(.subheadline.weight(.medium)).lineLimit(1)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
    }

    private func metric(_ value: Int, _ title: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(value)")
                .font(.system(size: 28, weight: .bold, design: .rounded).monospacedDigit())
                .contentTransition(.numericText(value: Double(value)))
            Text(title).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func show(_ message: String) {
        withAnimation(.snappy) { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(2.2))
            withAnimation(.snappy) { toast = nil }
        }
    }
}
