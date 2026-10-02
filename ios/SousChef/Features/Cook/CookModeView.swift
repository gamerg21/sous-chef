import SwiftData
import SwiftUI

/// Step-by-step cooking with big type, the screen kept awake, timers found in
/// the steps, and a pantry update at the end.
struct CookModeView: View {
    let recipe: Recipe
    let scale: Double
    /// Set when cooking a planned meal: the pantry update uses its servings and marks it cooked.
    var meal: PlannedMeal?

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0
    @State private var gathered: Set<UUID> = []
    @State private var timers: [CookTimer] = []
    @State private var addMissing = true
    @State private var finishing = false
    @State private var result: Kitchen.CookResult?
    @State private var chatting = false
    /// The step a custom timer is being set for.
    @State private var customTimerStep: CustomTimerStep?
    /// False when notifications and alarms are both off, so timers can't
    /// alert anyone once Sous Chef is closed.
    @State private var timersCanAlert = true
    @Environment(\.scenePhase) private var scenePhase
    /// Unfolded or on a wide screen, the ingredients stay beside the steps.
    @State private var twoPane = false
    /// An iPhone Duo propped half open on the counter.
    @State private var halfOpen = false

    /// Propped half open like a laptop with a timer running, the half lying
    /// on the counter shows the countdown. Propped like a book, the phone is
    /// wide and keeps its two panes.
    private var onCounter: Bool { halfOpen && !twoPane && !timers.isEmpty }
    private var steps: [RecipeStep] { recipe.steps }
    private var pageCount: Int { steps.count + 2 }
    /// Beside the steps, the ingredients no longer need a page of their own.
    private var firstPage: Int { twoPane ? 1 : 0 }
    private var currentStep: RecipeStep? { steps.indices.contains(page - 1) ? steps[page - 1] : nil }

    var body: some View {
        // Another device may delete the recipe while this is open.
        DeletedElsewhereGuard(recipe) { DeletedElsewhereGuard(meal) { screen } }
    }

    private var screen: some View {
        NavigationStack {
            Group {
                if twoPane { twoPaneLayout } else if onCounter { counterLayout } else { pagedLayout }
            }
            .animation(.snappy, value: onCounter)
            .animation(.bouncy, value: timers)
            .sensoryFeedback(.start, trigger: timers.count) { old, new in new > old }
            .tracksTwoPaneWidth($twoPane)
            .tracksHalfOpen($halfOpen)
            .onChange(of: twoPane) { page = max(page, firstPage) }
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
            .sheet(item: $customTimerStep) { target in
                CustomTimerSheet(defaultLabel: "Step \(target.id + 1)") { label, seconds in
                    timers.append(CookTimer(label: label, seconds: seconds, customStep: target.id))
                }
            }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            CookTimerAlerts.shared.sync(recipeTitle: recipe.title, timers: [])
        }
        // Mirrors the timers to a Live Activity and schedules their alerts.
        .onChange(of: timers) { _, timers in
            CookTimerAlerts.shared.sync(recipeTitle: recipe.title, timers: timers)
        }
        // Rechecked once the first timer's permission prompts are answered,
        // and after a visit to the Settings app.
        .task(id: timers.count) {
            guard !timers.isEmpty else { return }
            try? await Task.sleep(for: .seconds(1))
            timersCanAlert = await AlertPermissions.current().timersCanAlert
        }
        // Timers that finished while Sous Chef was in the background move
        // behind the running ones and say "Done" on the Lock Screen.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, !timers.isEmpty else { return }
            CookTimerAlerts.shared.sync(recipeTitle: recipe.title, timers: timers)
            Task { timersCanAlert = await AlertPermissions.current().timersCanAlert }
        }
    }

    /// The running timers, and a warning when they can't alert anyone.
    @ViewBuilder private var timerHeader: some View {
        if !timers.isEmpty {
            VStack(spacing: 4) {
                timerStrip
                if !timersCanAlert { silentTimersNotice }
            }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    /// Says why a timer won't be heard with the app closed, and where to fix it.
    @ViewBuilder private var silentTimersNotice: some View {
        if let url = AlertPermissions.settingsURL {
            Link(destination: url) {
                Label("Notifications are off, so timers only alert you in Sous Chef. Turn them on in Settings.", systemImage: "bell.slash")
                    .font(.footnote)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(.orange)
            .padding(.horizontal)
            .accessibilityIdentifier("timerNotificationsOff")
        }
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
            timerHeader
        }
        .safeAreaInset(edge: .bottom) { controls }
    }

    /// Ingredients and timers on one half, the steps on the other, meeting at
    /// the fold of an unfolded iPhone Duo.
    private var twoPaneLayout: some View {
        TwoPane {
            ingredientsPage
                .safeAreaInset(edge: .top) {
                    timerHeader
                }
        } secondary: {
            TabView(selection: $page) { stepPages }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.snappy, value: page)
                .safeAreaInset(edge: .bottom) { controls }
        }
    }

    /// Propped on the counter: the steps stand up facing the cook, and the
    /// half lying flat shows the timers in big type, with the controls in
    /// easy reach.
    private var counterLayout: some View {
        TwoPane(axis: .vertical) {
            TabView(selection: $page) {
                ingredientsPage.tag(0)
                stepPages
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.snappy, value: page)
        } secondary: {
            VStack(spacing: 16) {
                timerBoard
                controls
            }
            .padding(.top)
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
                Eyebrow("Ingredients", systemImage: "basket")
                Text(gatherTitle)
                    .font(.system(twoPane ? .title2 : .largeTitle, design: .rounded, weight: .bold))
                    .contentTransition(.numericText())
                VStack(alignment: .leading, spacing: twoPane ? 4 : 16) {
                    ForEach(recipe.ingredients) { ingredient in
                        ingredientRow(ingredient, inStep: twoPane && currentStep?.mentions(ingredient) == true)
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
            .padding(.horizontal, twoPane ? 12 : 0)
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
                let found = CookTimer.durations(in: step.text)
                ForEach(Array(found.enumerated()), id: \.element) { position, seconds in
                    if position == found.count - 1 {
                        HStack(spacing: 10) {
                            timerButton(label: "Step \(index + 1)", seconds: seconds)
                            addTimerButton(step: index, compact: true)
                        }
                    } else {
                        timerButton(label: "Step \(index + 1)", seconds: seconds)
                    }
                }
                if found.isEmpty { addTimerButton(step: index, compact: false) }
                ForEach(timers.filter { $0.customStep == index }) { timer in
                    runningTimer(timer)
                }
                // With room to spare, a glance at what's coming.
                if twoPane, steps.indices.contains(index + 1) {
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

    /// Starts a step's timer. Once started it turns into a live countdown, so
    /// it's clear the tap worked even before looking at the strip up top.
    @ViewBuilder
    private func timerButton(label: String, seconds: Int) -> some View {
        if let timer = timers.first(where: { $0.customStep == nil && $0.label == label && $0.seconds == seconds }) {
            runningTimer(timer)
        } else {
            Button {
                timers.append(CookTimer(label: label, seconds: seconds))
            } label: {
                Label("Start \(CookTimer.describe(seconds)) timer", systemImage: "timer")
                    .font(.headline)
            }
            .buttonStyle(.glassProminent)
            .tint(Color.brand)
            .transition(.scale(scale: 0.85).combined(with: .opacity))
        }
    }

    /// A step's timer counting down in place of the button that started it.
    private func runningTimer(_ timer: CookTimer) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let remaining = timer.remaining(at: context.date)
            let name = timer.customStep == nil ? "Timer" : timer.label
            Label(remaining == 0 ? "\(name) done" : "\(name) running · \(CookTimer.clock(remaining))",
                  systemImage: remaining == 0 ? "bell.and.waves.left.and.right.fill" : "timer")
                .font(.headline.monospacedDigit())
                .contentTransition(.numericText(countsDown: true))
                .symbolEffect(.pulse, isActive: remaining > 0)
                .foregroundStyle(remaining == 0 ? .orange : Color.brand)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.brandSoft, in: .capsule)
                .overlay(Capsule().strokeBorder(remaining == 0 ? .orange : Color.brand, lineWidth: 1.5))
        }
        .transition(.scale(scale: 0.85).combined(with: .opacity))
    }

    /// Opens the custom timer dial: a small "+" beside a step's own timers,
    /// or a labeled button on steps that don't mention a time.
    private func addTimerButton(step: Int, compact: Bool) -> some View {
        Button {
            customTimerStep = CustomTimerStep(id: step)
        } label: {
            if compact {
                Image(systemName: "plus")
                    .font(.headline)
                    .frame(width: 22, height: 22)
            } else {
                Label("Add a timer", systemImage: "plus").font(.subheadline.weight(.semibold))
            }
        }
        .buttonStyle(.glass)
        .buttonBorderShape(compact ? .circle : .capsule)
        .tint(Color.brand)
        .accessibilityLabel("Add a custom timer")
        .accessibilityIdentifier("addCustomTimer")
    }

    private var finishPage: some View {
        let plan = kitchen.plan(for: recipe, scale: meal == nil ? 1 : scale)
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
                            result = await kitchen.cook(recipe, addMissing: addMissing && !plan.missingIngredients.isEmpty, meal: meal)
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

                // Once the pantry is updated, "Finish" becomes the button that ends cooking.
                if result != nil && page == pageCount - 1 {
                    Button { dismiss() } label: {
                        Text("Finish").font(.headline).frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.glassProminent)
                    .accessibilityIdentifier("finishCooking")
                } else {
                    Text(page == 0 ? "Ingredients" : page > steps.count ? "Finish" : "Step \(page) of \(steps.count)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .frame(maxWidth: .infinity)
                }

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
                                .symbolEffect(.bounce, options: .nonRepeating, value: timer.id)
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
                        .foregroundStyle(.white)
                        .glassEffect(.regular.tint(remaining == 0 ? .orange : Color.brand).interactive(), in: .capsule)
                        .transition(.scale(scale: 0.6).combined(with: .opacity))
                        .onChange(of: remaining == 0) { _, done in
                            guard done else { return }
                            UINotificationFeedbackGenerator().notificationOccurred(.warning)
                            // Moves the finished timer behind the running ones.
                            CookTimerAlerts.shared.sync(recipeTitle: recipe.title, timers: timers)
                        }
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

/// The step index the custom timer sheet is open for.
private struct CustomTimerStep: Identifiable {
    let id: Int
}

nonisolated struct CookTimer: Identifiable, Hashable, Sendable {
    var id = UUID()
    let label: String
    let seconds: Int
    var started = Date()
    /// The step a timer was set on by hand from the custom timer dial; nil
    /// for timers started from a duration written in the step.
    var customStep: Int?

    var ends: Date { started.addingTimeInterval(TimeInterval(seconds)) }

    func remaining(at date: Date) -> Int { max(0, seconds - Int(date.timeIntervalSince(started))) }

    func isDone(at date: Date) -> Bool { ends <= date }

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
