import SwiftData
import SwiftUI

/// Step-by-step cooking with big type, the screen kept awake, timers found in
/// the steps, and a pantry update at the end.
struct CookModeView: View {
    let recipe: Recipe
    let scale: Double

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0
    @State private var gathered: Set<UUID> = []
    @State private var timers: [CookTimer] = []
    @State private var addMissing = true
    @State private var finishing = false
    @State private var result: Kitchen.CookResult?
    @State private var chatting = false
    /// Unfolded or on a wide screen, the ingredients stay beside the steps.
    @State private var twoPane = false
    /// How an iPhone Duo is being held.
    @State private var posture = FoldPosture.flat

    /// Propped half open like a laptop, the steps stand up facing the cook and
    /// the half lying on the counter holds the ingredients or the timers.
    /// Propped like a book, the phone keeps its two panes.
    private var onCounter: Bool { posture == .laptop }
    /// With the ingredients in a pane of their own, beside or below the steps.
    private var ingredientsBeside: Bool { twoPane || onCounter }
    private var steps: [RecipeStep] { recipe.steps }
    private var pageCount: Int { steps.count + 2 }
    /// Beside the steps, the ingredients no longer need a page of their own.
    private var firstPage: Int { ingredientsBeside ? 1 : 0 }
    private var currentStep: RecipeStep? { steps.indices.contains(page - 1) ? steps[page - 1] : nil }

    var body: some View {
        NavigationStack {
            Group {
                if onCounter { counterLayout } else if twoPane { twoPaneLayout } else { pagedLayout }
            }
            .animation(.snappy, value: onCounter)
            .tracksTwoPaneWidth($twoPane)
            .tracksFoldPosture($posture)
            .onChange(of: ingredientsBeside) { page = max(page, firstPage) }
            .navigationTitle(recipe.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark", role: .close) { dismiss() }
                }
                if kitchen.ai.isAvailable {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { chatting = true } label: { Label("Ask Sous Chef", systemImage: "apple.intelligence") }
                    }
                }
            }
            .sheet(isPresented: $chatting) { RecipeChatView(recipe: recipe).kitchenEnvironment(kitchen) }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    /// One page at a time: ingredients, each step, then finishing up.
    private var pagedLayout: some View {
        TabView(selection: $page) {
            ingredientsPage.tag(0)
            stepPages
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.snappy, value: page)
        .safeAreaInset(edge: .top) {
            if !timers.isEmpty { timerStrip }
        }
        .safeAreaInset(edge: .bottom) { controls }
    }

    /// Ingredients and timers on one half, the steps on the other, meeting at
    /// the fold of an unfolded iPhone Duo.
    private var twoPaneLayout: some View {
        TwoPane {
            ingredientsPage
                .safeAreaInset(edge: .top) {
                    if !timers.isEmpty { timerStrip }
                }
        } secondary: {
            TabView(selection: $page) { stepPages }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.snappy, value: page)
                .safeAreaInset(edge: .bottom) { controls }
        }
    }

    /// Propped on the counter: the steps stand up facing the cook, and the
    /// half lying flat shows the timers in big type once one is running, the
    /// ingredients until then, with the controls in easy reach.
    private var counterLayout: some View {
        TwoPane(axis: .vertical) {
            TabView(selection: $page) { stepPages }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.snappy, value: page)
        } secondary: {
            VStack(spacing: 16) {
                if timers.isEmpty { ingredientsPage } else { timerBoard }
                controls
            }
            .padding(.top)
            .animation(.snappy, value: timers.isEmpty)
        }
    }

    @ViewBuilder private var stepPages: some View {
        ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
            stepPage(index: index, step: step).tag(index + 1)
        }
        finishPage.tag(steps.count + 1)
    }

    private var ingredientsPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Eyebrow("Mise en place", systemImage: "basket")
                Text(gatherTitle)
                    .font(.system(ingredientsBeside ? .title2 : .largeTitle, design: .rounded, weight: .bold))
                    .contentTransition(.numericText())
                VStack(alignment: .leading, spacing: ingredientsBeside ? 4 : 16) {
                    ForEach(recipe.ingredients) { ingredient in
                        ingredientRow(ingredient, inStep: ingredientsBeside && currentStep?.mentions(ingredient) == true)
                    }
                }
            }
            .padding()
        }
    }

    private func ingredientRow(_ ingredient: Ingredient, inStep: Bool) -> some View {
        Button {
            withAnimation(.snappy) {
                if gathered.contains(ingredient.id) { gathered.remove(ingredient.id) } else { gathered.insert(ingredient.id) }
            }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: gathered.contains(ingredient.id) ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(gathered.contains(ingredient.id) ? Color.brand : .secondary)
                    .contentTransition(.symbolEffect(.replace))
                VStack(alignment: .leading) {
                    Text(ingredient.name).font(.title3.weight(inStep ? .semibold : .regular)).strikethrough(gathered.contains(ingredient.id))
                    if let note = ingredient.note { Text(note).font(.callout).foregroundStyle(.secondary) }
                }
                Spacer()
                Text(Units.amount(ingredient.quantity.map { $0 * scale }, ingredient.unit))
                    .font(.title3.monospacedDigit())
                    .foregroundStyle(inStep ? Color.brand : .secondary)
            }
            .padding(.vertical, 6)
            .padding(.horizontal, ingredientsBeside ? 12 : 0)
            .background(inStep ? Color.brandSoft : .clear, in: .rect(cornerRadius: 16, style: .continuous))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityValue(inStep ? "Used in this step" : "")
        .animation(.snappy, value: inStep)
    }

    private var gatherTitle: String {
        let remaining = recipe.ingredients.filter { !gathered.contains($0.id) }.count
        if recipe.ingredients.isEmpty { return "No ingredients listed" }
        if remaining == 0 { return "Ready to cook" }
        if gathered.isEmpty { return "Gather \(remaining) ingredient\(remaining == 1 ? "" : "s")" }
        return "\(remaining) more to gather"
    }

    private func stepPage(index: Int, step: RecipeStep) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Eyebrow("Step \(index + 1) of \(steps.count)")
                Text(step.text)
                    .font(.title.weight(.medium))
                .fontDesign(.rounded)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(CookTimer.durations(in: step.text), id: \.self) { seconds in
                    let label = "Step \(index + 1)"
                    // One timer per step and duration; removing it offers the button again.
                    let running = timers.contains { $0.label == label && $0.seconds == seconds }
                    Button {
                        timers.append(CookTimer(label: label, seconds: seconds))
                    } label: {
                        Label(
                            running ? "\(CookTimer.describe(seconds)) timer running" : "Start \(CookTimer.describe(seconds)) timer",
                            systemImage: running ? "timer.circle.fill" : "timer"
                        )
                        .font(.headline)
                        .contentTransition(.symbolEffect(.replace))
                    }
                    .buttonStyle(.glass)
                    .disabled(running)
                }
                // With room to spare, a glance at what's coming.
                if ingredientsBeside, steps.indices.contains(index + 1) {
                    VStack(alignment: .leading, spacing: 6) {
                        Eyebrow("Up next", systemImage: "arrow.turn.down.right")
                        Text(steps[index + 1].text).font(.body).foregroundStyle(.secondary).lineLimit(3)
                    }
                    .padding(.top, 12)
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var finishPage: some View {
        let plan = kitchen.plan(for: recipe)
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Eyebrow("All done", systemImage: "checkmark.seal")
                Text("Enjoy your meal").heroTitle()
                if let result {
                    Card {
                        Label(result.onServer ? "Your pantry was updated on your Sous Chef server." : "Your pantry is updated.", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Color.brand)
                        if result.addedToShopping > 0 {
                            Label("Added \(result.addedToShopping) item\(result.addedToShopping == 1 ? "" : "s") to your shopping list.", systemImage: "cart.badge.plus")
                        }
                    }
                    Button("Close") { dismiss() }.buttonStyle(.glassProminent)
                } else {
                    Card {
                        Eyebrow("This will use", systemImage: "minus.circle")
                        if plan.deductions.isEmpty {
                            Text("Nothing in your pantry matches this recipe.").foregroundStyle(.secondary)
                        }
                        ForEach(plan.deductions, id: \.self) { deduction in
                            HStack {
                                Text(deduction.name)
                                Spacer()
                                Text("−\(Units.amount(deduction.quantity, deduction.unit))").monospacedDigit().foregroundStyle(.secondary)
                            }
                        }
                    }
                    if !plan.missingIngredients.isEmpty {
                        Card {
                            Eyebrow("You didn't have", systemImage: "cart")
                            Text(plan.missingIngredients.map(\.name).joined(separator: ", ")).font(.callout)
                            Toggle("Add them to the shopping list", isOn: $addMissing)
                        }
                    }
                    if !plan.checks.isEmpty {
                        Card {
                            Eyebrow("Check by hand", systemImage: "exclamationmark.circle")
                            ForEach(plan.checks, id: \.self) { Text("\($0.name): \($0.reason)").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    Button {
                        finishing = true
                        Task {
                            result = await kitchen.cook(recipe, addMissing: addMissing && !plan.missingIngredients.isEmpty)
                            finishing = false
                            UINotificationFeedbackGenerator().notificationOccurred(.success)
                        }
                    } label: {
                        Group {
                            if finishing { ProgressView() } else { Label("Update my pantry", systemImage: "checkmark") }
                        }
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.glassProminent)
                    .disabled(finishing)
                    .accessibilityIdentifier("updatePantry")
                    Button("Finish without updating") { dismiss() }
                        .frame(maxWidth: .infinity)
                }
            }
            .padding()
        }
    }

    private var controls: some View {
        GlassEffectContainer(spacing: 12) {
            HStack(spacing: 12) {
                Button {
                    page = max(firstPage, page - 1)
                } label: {
                    Image(systemName: "chevron.left").font(.title3.weight(.semibold)).frame(width: 52, height: 44)
                }
                .buttonStyle(.glass)
                .disabled(page <= firstPage)

                Text(page == 0 ? "Ingredients" : page > steps.count ? "Finish" : "Step \(page) of \(steps.count)")
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .frame(maxWidth: .infinity)

                Button {
                    page = min(pageCount - 1, page + 1)
                } label: {
                    Image(systemName: "chevron.right").font(.title3.weight(.semibold)).frame(width: 52, height: 44)
                }
                .buttonStyle(.glassProminent)
                .disabled(page == pageCount - 1)
                .accessibilityIdentifier("nextStep")
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }

    private var timerStrip: some View {
        ScrollView(.horizontal) {
            HStack {
                ForEach(timers) { timer in
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let remaining = timer.remaining(at: context.date)
                        HStack(spacing: 8) {
                            Image(systemName: remaining == 0 ? "bell.and.waves.left.and.right.fill" : "timer")
                                .symbolEffect(.wiggle, isActive: remaining == 0)
                            Text(remaining == 0 ? "\(timer.label) done" : CookTimer.clock(remaining))
                                .font(.headline.monospacedDigit())
                            Button("Remove \(timer.label) timer", systemImage: "xmark.circle.fill") {
                                timers.removeAll { $0.id == timer.id }
                            }
                            .labelStyle(.iconOnly)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundStyle(remaining == 0 ? .orange : .primary)
                        .glassEffect(.regular.interactive(), in: .capsule)
                        .buzzes(whenDone: remaining == 0)
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
    }

    /// The timers in type big enough to read from across the kitchen.
    private var timerBoard: some View {
        HStack(spacing: 12) {
            ForEach(timers) { timer in
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let remaining = timer.remaining(at: context.date)
                    VStack(spacing: 10) {
                        HStack {
                            Image(systemName: remaining == 0 ? "bell.and.waves.left.and.right.fill" : "timer")
                                .symbolEffect(.wiggle, isActive: remaining == 0)
                            Text(timer.label).textCase(.uppercase).tracking(1.1)
                            Spacer()
                            Button("Remove \(timer.label) timer", systemImage: "xmark.circle.fill") {
                                timers.removeAll { $0.id == timer.id }
                            }
                            .labelStyle(.iconOnly)
                            .foregroundStyle(.secondary)
                        }
                        .font(.subheadline.weight(.semibold))
                        Text(remaining == 0 ? "Done" : CookTimer.clock(remaining))
                            .font(.system(size: 96, weight: .semibold, design: .rounded).monospacedDigit())
                            .minimumScaleFactor(0.3)
                            .lineLimit(1)
                            .frame(maxHeight: .infinity)
                        ProgressView(value: Double(timer.seconds - remaining), total: Double(timer.seconds))
                            .tint(remaining == 0 ? .orange : Color.brand)
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .foregroundStyle(remaining == 0 ? .orange : .primary)
                    .glassEffect(.regular, in: .rect(cornerRadius: 28, style: .continuous))
                    .buzzes(whenDone: remaining == 0)
                }
            }
        }
        .padding(.horizontal)
    }
}

private extension View {
    /// A warning buzz as a timer runs out.
    func buzzes(whenDone done: Bool) -> some View {
        onChange(of: done) { _, done in
            if done { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
        }
    }
}

extension RecipeStep {
    /// Whether the step names this ingredient, going by its last word so
    /// "Lemons" matches "zest the lemon" and "olive oil" matches "the oil".
    func mentions(_ ingredient: Ingredient) -> Bool {
        guard let noun = Self.words(in: ingredient.name).last else { return false }
        return Self.words(in: text).contains(noun)
    }

    /// Lowercased words, roughly singular: "tomatoes" → "tomato", "berries" → "berry".
    private static func words(in text: String) -> [String] {
        text.lowercased().split { !$0.isLetter }.map { word in
            if word.hasSuffix("oes") || word.hasSuffix("ches") || word.hasSuffix("shes") { return String(word.dropLast(2)) }
            if word.hasSuffix("ies"), word.count > 4 { return word.dropLast(3) + "y" }
            if word.hasSuffix("s"), !word.hasSuffix("ss"), word.count > 3 { return String(word.dropLast()) }
            return String(word)
        }
    }
}

struct CookTimer: Identifiable {
    let id = UUID()
    let label: String
    let seconds: Int
    let started = Date()

    func remaining(at date: Date) -> Int { max(0, seconds - Int(date.timeIntervalSince(started))) }

    static func clock(_ seconds: Int) -> String {
        Duration.seconds(seconds).formatted(.time(pattern: seconds >= 3600 ? .hourMinuteSecond : .minuteSecond))
    }

    static func describe(_ seconds: Int) -> String {
        seconds % 3600 == 0 ? "\(seconds / 3600)-hour" : seconds >= 3600 ? "\(seconds / 60)-minute" : seconds % 60 == 0 ? "\(seconds / 60)-minute" : "\(seconds)-second"
    }

    /// Durations mentioned in a step: "10 minutes", "1–2 hours" (uses the upper bound), "30 sec".
    static func durations(in text: String) -> [Int] {
        guard let regex = try? NSRegularExpression(pattern: #"(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b"#, options: .caseInsensitive) else { return [] }
        var result: [Int] = []
        for match in regex.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            func group(_ index: Int) -> String? { Range(match.range(at: index), in: text).map { String(text[$0]) } }
            guard let value = Double(group(2) ?? group(1) ?? ""), let unit = group(3)?.lowercased() else { continue }
            let multiplier = unit.hasPrefix("h") ? 3600.0 : unit.hasPrefix("m") ? 60 : 1
            let seconds = Int(value * multiplier)
            if seconds > 0 && seconds <= 24 * 3600 && !result.contains(seconds) { result.append(seconds) }
        }
        return result
    }
}
