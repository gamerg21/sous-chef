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

    private var steps: [RecipeStep] { recipe.steps }
    private var pageCount: Int { steps.count + 2 }

    var body: some View {
        NavigationStack {
            TabView(selection: $page) {
                ingredientsPage.tag(0)
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    stepPage(index: index, step: step).tag(index + 1)
                }
                finishPage.tag(steps.count + 1)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.snappy, value: page)
            .safeAreaInset(edge: .top) {
                if !timers.isEmpty { timerStrip }
            }
            .safeAreaInset(edge: .bottom) { controls }
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
            .sheet(isPresented: $chatting) { RecipeChatView(recipe: recipe) }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    private var ingredientsPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Eyebrow("Gather your ingredients", systemImage: "basket")
                Text("Mise en place").heroTitle()
                ForEach(recipe.ingredients) { ingredient in
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
                                Text(ingredient.name).font(.title3).strikethrough(gathered.contains(ingredient.id))
                                if let note = ingredient.note { Text(note).font(.callout).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Text(Units.amount(ingredient.quantity.map { $0 * scale }, ingredient.unit))
                                .font(.title3.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding()
        }
    }

    private func stepPage(index: Int, step: RecipeStep) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Eyebrow("Step \(index + 1) of \(steps.count)")
                Text(step.text)
                    .font(.system(size: 30, weight: .medium, design: .rounded))
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(CookTimer.durations(in: step.text), id: \.self) { seconds in
                    Button {
                        timers.append(CookTimer(label: "Step \(index + 1)", seconds: seconds))
                    } label: {
                        Label("Start \(CookTimer.describe(seconds)) timer", systemImage: "timer")
                            .font(.headline)
                    }
                    .buttonStyle(.glass)
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
                    page = max(0, page - 1)
                } label: {
                    Image(systemName: "chevron.left").font(.title3.weight(.semibold)).frame(width: 52, height: 44)
                }
                .buttonStyle(.glass)
                .disabled(page == 0)

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
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(timers) { timer in
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        let remaining = timer.remaining(at: context.date)
                        HStack(spacing: 8) {
                            Image(systemName: remaining == 0 ? "bell.and.waves.left.and.right.fill" : "timer")
                                .symbolEffect(.wiggle, isActive: remaining == 0)
                            Text(remaining == 0 ? "\(timer.label) done" : CookTimer.clock(remaining))
                                .font(.headline.monospacedDigit())
                            Button {
                                timers.removeAll { $0.id == timer.id }
                            } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundStyle(remaining == 0 ? .orange : .primary)
                        .glassEffect(.regular.interactive(), in: .capsule)
                        .onChange(of: remaining == 0) { _, done in
                            if done { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
                        }
                    }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 4)
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
        seconds >= 3600 ? String(format: "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60) : String(format: "%d:%02d", seconds / 60, seconds % 60)
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
