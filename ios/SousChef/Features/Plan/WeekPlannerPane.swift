import SwiftData
import SwiftUI

/// The week beside the recipe library on an unfolded iPhone Duo (or any wide
/// screen): drag a recipe onto a day's breakfast, lunch or dinner, or drag a
/// planned meal to another day.
struct WeekPlannerPane: View {
    /// Opens a recipe in the library beside the planner.
    var onOpen: (Recipe) -> Void

    @Environment(Kitchen.self) private var kitchen
    @State private var weekStart = MealPlanner.weekStart()
    @State private var planning: PlanSlotTarget?
    @State private var cooking: PlannedMeal?
    @State private var toast: String?
    @State private var toastTask: Task<Void, Never>?
    @State private var landed = 0

    var body: some View {
        NavigationStack {
            WeekTimeline(
                weekStart: weekStart,
                onOpen: onOpen,
                onPlan: { planning = $0 },
                onCook: { cooking = $0 },
                onDropped: dropped,
                onAddShortages: addShortages
            )
            .id(weekStart)
            .transition(.opacity)
            .navigationTitle(weekTitle)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    if weekStart != MealPlanner.weekStart() {
                        Button("This week", systemImage: "calendar.badge.clock") { move(to: MealPlanner.weekStart()) }
                    }
                    Button("Previous week", systemImage: "chevron.left") { move(to: MealPlanner.day(weekStart, adding: -7)) }
                    Button("Next week", systemImage: "chevron.right") { move(to: MealPlanner.day(weekStart, adding: 7)) }
                }
            }
            .overlay(alignment: .top) {
                if let toast {
                    Label(toast, systemImage: "checkmark.circle.fill")
                        .font(.callout.weight(.medium))
                        .symbolRenderingMode(.multicolor)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .glassEffect(.regular, in: .capsule)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, 8)
                }
            }
            .sensoryFeedback(.success, trigger: landed)
            .sheet(item: $planning) { target in
                PlanRecipePicker(day: target.day, slot: target.slot)
                    .kitchenEnvironment(kitchen)
            }
            .fullScreenCover(item: $cooking) { meal in
                if let recipe = kitchen.recipe(for: meal) {
                    CookModeView(recipe: recipe, scale: kitchen.scale(for: meal), meal: meal)
                        .kitchenEnvironment(kitchen)
                }
            }
        }
    }

    private var weekTitle: String {
        let current = MealPlanner.weekStart()
        if weekStart == current { return "This Week" }
        if weekStart == MealPlanner.day(current, adding: 7) { return "Next Week" }
        if weekStart == MealPlanner.day(current, adding: -7) { return "Last Week" }
        return "Week of \(MealPlanner.date(weekStart).formatted(.dateTime.day().month()))"
    }

    private func move(to start: String) {
        withAnimation(.smooth) { weekStart = start }
    }

    private func dropped(_ meal: PlannedMeal) {
        landed += 1
        let title = kitchen.recipe(for: meal)?.title ?? "Meal"
        let day = MealPlanner.date(meal.day).formatted(.dateTime.weekday(.wide))
        show("\(title) · \(day) \(meal.slot.title.lowercased())")
    }

    private func addShortages() {
        let result = kitchen.addWeekShortages(from: weekStart)
        landed += 1
        show(result.added + result.updated == 0 ? "Your list already covers this week" : "Added \(result.added), topped up \(result.updated)")
    }

    private func show(_ message: String) {
        toastTask?.cancel()
        withAnimation(.snappy) { toast = message }
        toastTask = Task {
            try? await Task.sleep(for: .seconds(2.2))
            guard !Task.isCancelled else { return }
            withAnimation(.snappy) { toast = nil }
        }
    }
}

/// A day and meal the recipe picker opens for.
struct PlanSlotTarget: Identifiable {
    let day: String
    let slot: MealSlot
    var id: String { "\(day)-\(slot.rawValue)" }
}

/// One week as a timeline of days, each with a well per meal. The query is
/// rebuilt for each week shown.
private struct WeekTimeline: View {
    let weekStart: String
    var onOpen: (Recipe) -> Void
    var onPlan: (PlanSlotTarget) -> Void
    var onCook: (PlannedMeal) -> Void
    var onDropped: (PlannedMeal) -> Void
    var onAddShortages: () -> Void

    @Query private var meals: [PlannedMeal]
    @Query private var recipes: [Recipe]
    @Query private var pantry: [PantryItem]

    /// The meals with a well of their own; snacks show beneath the day.
    static let slots: [MealSlot] = [.breakfast, .lunch, .dinner]

    init(weekStart: String, onOpen: @escaping (Recipe) -> Void, onPlan: @escaping (PlanSlotTarget) -> Void,
         onCook: @escaping (PlannedMeal) -> Void, onDropped: @escaping (PlannedMeal) -> Void, onAddShortages: @escaping () -> Void) {
        self.weekStart = weekStart
        self.onOpen = onOpen
        self.onPlan = onPlan
        self.onCook = onCook
        self.onDropped = onDropped
        self.onAddShortages = onAddShortages
        let end = MealPlanner.day(weekStart, adding: 7)
        _meals = Query(filter: #Predicate<PlannedMeal> { $0.day >= weekStart && $0.day < end })
    }

    var body: some View {
        let recipesByID = Dictionary(recipes.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        let stock = pantry.map { StockLine(id: $0.uuid, name: $0.name, quantity: $0.quantity, unit: $0.unit, expiresOn: $0.expiresOn) }
        let today = MealPlanner.day(.now)
        let byDay = Dictionary(grouping: meals, by: \.day)
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                WeekSummaryCard(weekStart: weekStart, meals: meals, recipesByID: recipesByID, stock: stock, onAddShortages: onAddShortages)
                LazyVStack(spacing: 10) {
                    ForEach(MealPlanner.week(from: weekStart), id: \.self) { day in
                        DayRow(day: day, today: today, meals: byDay[day] ?? [], recipesByID: recipesByID, stock: stock,
                               onOpen: onOpen, onPlan: onPlan, onCook: onCook, onDropped: onDropped)
                    }
                }
                .background(alignment: .leading) {
                    // The timeline's spine, running behind the day badges.
                    Capsule()
                        .fill(.quaternary)
                        .frame(width: 2)
                        .padding(.leading, 21)
                        .padding(.vertical, 28)
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
    }
}

/// How full the week is, at a glance, and what it still needs from the shop.
private struct WeekSummaryCard: View {
    let weekStart: String
    let meals: [PlannedMeal]
    let recipesByID: [UUID: Recipe]
    let stock: [StockLine]
    var onAddShortages: () -> Void

    var body: some View {
        let slots = WeekTimeline.slots
        let days = MealPlanner.week(from: weekStart)
        let planned = Set(meals.filter { slots.contains($0.slot) }.map { "\($0.day)-\($0.slotRaw)" })
        let open = meals.filter { !$0.isCooked }
        let shortages = MealPlanner.shortages(for: open.compactMap { meal in
            meal.recipeUUID.flatMap { recipesByID[$0] }.map {
                MealPlanner.scaled($0.ingredients, by: MealPlanner.scale(servings: meal.servings, recipeServings: $0.servings))
            }
        }, stock: stock)
        let missing = shortages.missingIngredients.count
        let total = days.count * slots.count
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(range(days))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(planned.count)")
                            .font(.system(size: 34, weight: .bold, design: .rounded).monospacedDigit())
                            .contentTransition(.numericText(value: Double(planned.count)))
                        Text("of \(total) meals")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
                // A dot per meal: days across, breakfast to dinner down.
                HStack(spacing: 4) {
                    ForEach(days, id: \.self) { day in
                        VStack(spacing: 4) {
                            ForEach(slots) { slot in
                                RoundedRectangle(cornerRadius: 3, style: .continuous)
                                    .fill(planned.contains("\(day)-\(slot.rawValue)") ? AnyShapeStyle(Color.brand) : AnyShapeStyle(.quaternary))
                                    .frame(width: 12, height: 12)
                            }
                        }
                    }
                }
                .accessibilityHidden(true)
            }
            Divider()
            if meals.isEmpty {
                Label("Drag a recipe onto a day to plan it", systemImage: "hand.draw")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else if missing == 0 {
                Label(open.isEmpty ? "Every meal is cooked" : "Your pantry covers every meal", systemImage: "checkmark.circle.fill")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Color.brand)
            } else {
                HStack(spacing: 12) {
                    Label("\(missing) item\(missing == 1 ? "" : "s") short", systemImage: "cart")
                        .font(.callout.weight(.medium))
                    Spacer(minLength: 0)
                    Button("Add to list", systemImage: "cart.badge.plus", action: onAddShortages)
                        .font(.callout.weight(.semibold))
                        .buttonStyle(.glassProminent)
                        .controlSize(.small)
                }
            }
        }
        .padding(16)
        .background(.background.secondary, in: .rect(cornerRadius: 22, style: .continuous))
        .animation(.snappy, value: planned)
    }

    private func range(_ days: [String]) -> String {
        guard let first = days.first, let last = days.last else { return "" }
        return (MealPlanner.date(first)..<MealPlanner.date(last).addingTimeInterval(1)).formatted(.interval.month(.abbreviated).day())
    }
}

/// A day on the timeline: its date, and a well for each meal.
private struct DayRow: View {
    let day: String
    let today: String
    let meals: [PlannedMeal]
    let recipesByID: [UUID: Recipe]
    let stock: [StockLine]
    var onOpen: (Recipe) -> Void
    var onPlan: (PlanSlotTarget) -> Void
    var onCook: (PlannedMeal) -> Void
    var onDropped: (PlannedMeal) -> Void

    var body: some View {
        let snacks = meals.filter { !WeekTimeline.slots.contains($0.slot) }
        HStack(alignment: .top, spacing: 10) {
            DayBadge(day: day, isToday: day == today, compact: isPast)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    ForEach(WeekTimeline.slots) { slot in
                        MealWell(day: day, slot: slot, meals: inSlot(slot), compact: isPast, recipesByID: recipesByID, stock: stock,
                                 onOpen: onOpen, onPlan: onPlan, onCook: onCook, onDropped: onDropped)
                    }
                }
                if !snacks.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(snacks) { snack in
                            Chip(text: snack.recipeUUID.flatMap { recipesByID[$0] }?.title ?? "Snack", systemImage: MealSlot.snack.symbol)
                        }
                    }
                }
            }
        }
        .opacity(isPast ? 0.75 : 1)
    }

    /// Days gone by shrink, so today and what's ahead get the room.
    private var isPast: Bool { day < today }

    private func inSlot(_ slot: MealSlot) -> [PlannedMeal] {
        meals.filter { $0.slot == slot }.sorted { $0.createdAt < $1.createdAt }
    }
}

private struct DayBadge: View {
    let day: String
    let isToday: Bool
    var compact = false

    var body: some View {
        let date = MealPlanner.date(day)
        VStack(spacing: 0) {
            Text(date.formatted(.dateTime.weekday(.abbreviated)).uppercased())
                .font(.caption2.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(isToday ? AnyShapeStyle(.white.opacity(0.85)) : AnyShapeStyle(.secondary))
            Text(date.formatted(.dateTime.day()))
                .font(.system(compact ? .callout : .title3, design: .rounded, weight: .bold).monospacedDigit())
                .foregroundStyle(isToday ? .white : .primary)
        }
        .frame(width: 44, height: compact ? 44 : 56)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(isToday ? AnyShapeStyle(Color.brand.gradient) : AnyShapeStyle(.background))
                .shadow(color: isToday ? Color.brand.opacity(0.35) : .clear, radius: 8, y: 3)
        }
        .padding(.top, compact ? 0 : 10)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(date.formatted(.dateTime.weekday(.wide).day().month()) + (isToday ? ", today" : ""))
    }
}

/// One meal of one day. Empty, it waits for a drop (and lights up while
/// something is being dragged); planned, it shows the recipe and can itself
/// be dragged to another day.
private struct MealWell: View {
    let day: String
    let slot: MealSlot
    let meals: [PlannedMeal]
    /// A day gone by: a slim well with just the meal's symbol or title.
    let compact: Bool
    let recipesByID: [UUID: Recipe]
    let stock: [StockLine]
    var onOpen: (Recipe) -> Void
    var onPlan: (PlanSlotTarget) -> Void
    var onCook: (PlannedMeal) -> Void
    var onDropped: (PlannedMeal) -> Void

    @Environment(Kitchen.self) private var kitchen
    @State private var targeted = false
    private var dragState = PlanDragState.shared
    private static let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)

    init(day: String, slot: MealSlot, meals: [PlannedMeal], compact: Bool, recipesByID: [UUID: Recipe], stock: [StockLine],
         onOpen: @escaping (Recipe) -> Void, onPlan: @escaping (PlanSlotTarget) -> Void,
         onCook: @escaping (PlannedMeal) -> Void, onDropped: @escaping (PlannedMeal) -> Void) {
        self.day = day
        self.slot = slot
        self.meals = meals
        self.compact = compact
        self.recipesByID = recipesByID
        self.stock = stock
        self.onOpen = onOpen
        self.onPlan = onPlan
        self.onCook = onCook
        self.onDropped = onDropped
    }

    var body: some View {
        ZStack {
            if let meal = meals.first {
                planned(meal)
                    .id(meal.uuid)
                    .transition(.scale(scale: 0.82).combined(with: .opacity))
            } else {
                empty.transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: compact ? 44 : 76)
        .overlay {
            if targeted {
                Self.shape
                    .fill(Color.brand.opacity(meals.isEmpty ? 0.16 : 0.42))
                    .overlay {
                        if !meals.isEmpty {
                            Label("Add", systemImage: "plus")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .overlay(Self.shape.strokeBorder(Color.brand, lineWidth: 2.5))
                    .shadow(color: Color.brand.opacity(0.45), radius: 12)
                    .transition(.opacity)
                    .allowsHitTesting(false)
            }
        }
        .scaleEffect(targeted ? 1.06 : 1)
        .zIndex(targeted ? 1 : 0)
        .animation(.spring(response: 0.28, dampingFraction: 0.66), value: targeted)
        .animation(.bouncy(duration: 0.45), value: meals.map(\.uuid))
        .dropDestination(for: String.self) { items, _ in
            guard let drag = items.lazy.compactMap(PlanDrag.init(payload:)).first else { return false }
            dragState.isDragging = false
            guard let meal = withAnimation(.bouncy(duration: 0.45), { kitchen.drop(drag, on: day, slot: slot) }) else { return false }
            onDropped(meal)
            return true
        } isTargeted: { targeted = $0 }
        .sensoryFeedback(.selection, trigger: targeted) { _, now in now }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("planWell-\(day)-\(slot.rawValue)")
    }

    private var empty: some View {
        let inviting = dragState.isDragging
        return Button { onPlan(PlanSlotTarget(day: day, slot: slot)) } label: {
            VStack(spacing: 4) {
                Image(systemName: targeted ? "plus.circle.fill" : slot.symbol)
                    .font(targeted ? .title2 : .body.weight(.medium))
                    .contentTransition(.symbolEffect(.replace))
                    .symbolEffect(.breathe, isActive: inviting && !targeted)
                if !compact && !targeted {
                    Text(slot.title)
                        .font(.caption2.weight(.semibold))
                }
            }
            .foregroundStyle(inviting ? AnyShapeStyle(Color.brand) : AnyShapeStyle(.tertiary))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Self.shape.fill(inviting ? AnyShapeStyle(Color.brand.opacity(0.08)) : AnyShapeStyle(.background.secondary.opacity(0.5))))
            .overlay(
                Self.shape.strokeBorder(
                    inviting ? AnyShapeStyle(Color.brand.opacity(0.6)) : AnyShapeStyle(.quaternary),
                    style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])
                )
            )
            .contentShape(Self.shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Plan \(slot.title.lowercased()), \(MealPlanner.date(day).formatted(.dateTime.weekday(.wide)))")
    }

    private func planned(_ meal: PlannedMeal) -> some View {
        let recipe = meal.recipeUUID.flatMap { recipesByID[$0] }
        return Button {
            if let recipe { onOpen(recipe) }
        } label: {
            artwork(recipe)
                .overlay {
                    LinearGradient(stops: [.init(color: .clear, location: 0.25), .init(color: .black.opacity(0.7), location: 1)],
                                   startPoint: .top, endPoint: .bottom)
                }
                .overlay(alignment: .bottomLeading) {
                    Text(recipe?.title ?? "Deleted recipe")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(compact ? 1 : 2)
                        .multilineTextAlignment(.leading)
                        .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        .padding(.horizontal, 8)
                        .padding(.bottom, 7)
                }
                .overlay(alignment: .topTrailing) { badge(meal, recipe: recipe) }
                .opacity(meal.isCooked ? 0.8 : 1)
                .clipShape(Self.shape)
                .contentShape(Self.shape)
        }
        .buttonStyle(.plain)
        .contextMenu { menu(meal, recipe: recipe) }
        .plannable(.meal(meal.uuid)) { PlanDragPreview(title: recipe?.title ?? "Meal", photo: recipe?.photo) }
        .accessibilityLabel("\(slot.title), \(recipe?.title ?? "Deleted recipe")\(meal.isCooked ? ", cooked" : "")")
    }

    /// The recipe's photo, or without one a wash in the meal's color.
    @ViewBuilder private func artwork(_ recipe: Recipe?) -> some View {
        if let photo = recipe?.photo {
            RecipeImage(data: photo, maxPixel: 400)
        } else {
            LinearGradient(colors: slot.wash, startPoint: .topLeading, endPoint: .bottomTrailing)
                .overlay(alignment: .topLeading) {
                    Image(systemName: slot.symbol)
                        .font(.system(size: compact ? 16 : 24, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.35))
                        .padding(compact ? 6 : 8)
                        .accessibilityHidden(true)
                }
        }
    }

    /// Cooked, short of something, or more than one meal in the slot.
    @ViewBuilder private func badge(_ meal: PlannedMeal, recipe: Recipe?) -> some View {
        HStack(spacing: 4) {
            if meals.count > 1 {
                Text("+\(meals.count - 1)")
                    .font(.caption2.weight(.bold).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.black.opacity(0.35), in: .capsule)
            }
            if meal.isCooked {
                Image(systemName: "checkmark.circle.fill")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, Color.brand)
            } else if let recipe, !recipe.ingredients.isEmpty {
                let missing = CookingPlanner.plan(ingredients: MealPlanner.scaled(recipe.ingredients, by: MealPlanner.scale(servings: meal.servings, recipeServings: recipe.servings)), stock: stock).missingIngredients.count
                Circle()
                    .fill(missing == 0 ? Color.brand : .orange)
                    .frame(width: 9, height: 9)
                    .overlay(Circle().strokeBorder(.white, lineWidth: 1.5))
                    .accessibilityLabel(missing == 0 ? "Ready to cook" : "Need \(missing)")
            }
        }
        .font(.subheadline)
        .padding(6)
    }

    @ViewBuilder private func menu(_ meal: PlannedMeal, recipe: Recipe?) -> some View {
        if let recipe {
            Button("Open Recipe", systemImage: "book.pages") { onOpen(recipe) }
            if !meal.isCooked {
                Button("Cook", systemImage: "flame") { onCook(meal) }
            }
        }
        Button(meal.isCooked ? "Mark Not Cooked" : "Mark Cooked", systemImage: meal.isCooked ? "arrow.uturn.backward" : "checkmark") {
            kitchen.setCooked(meal, !meal.isCooked)
        }
        if meals.count > 1 {
            Menu("Also planned", systemImage: "square.stack") {
                ForEach(meals.dropFirst()) { other in
                    if let other = other.recipeUUID.flatMap({ recipesByID[$0] }) {
                        Button(other.title) { onOpen(other) }
                    }
                }
            }
        }
        Divider()
        Button("Remove", systemImage: "trash", role: .destructive) {
            withAnimation(.snappy) {
                kitchen.delete(meal, undoable: true)
                kitchen.changed()
            }
        }
    }
}

extension MealSlot {
    /// The planner's wash for a meal with no photo: sunrise, midday, evening.
    var wash: [Color] {
        switch self {
        case .breakfast: [Color(red: 0.96, green: 0.58, blue: 0.16), Color(red: 0.86, green: 0.33, blue: 0.18)]
        case .lunch: [Color(red: 0.20, green: 0.74, blue: 0.52), Color(red: 0.0, green: 0.55, blue: 0.47)]
        case .dinner: [Color(red: 0.42, green: 0.40, blue: 0.93), Color(red: 0.27, green: 0.22, blue: 0.68)]
        case .snack: [Color(red: 0.93, green: 0.36, blue: 0.55), Color(red: 0.75, green: 0.22, blue: 0.47)]
        }
    }
}
