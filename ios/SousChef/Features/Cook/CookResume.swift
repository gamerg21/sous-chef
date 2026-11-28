import SwiftData
import SwiftUI

/// The recipe set aside, above the tab bar: its name, the cook's place in it
/// and the next timer. Tapping it goes back into cook mode.
struct CookResumeBar: View {
    let session: CookSession
    /// Asks before ending the session.
    var onStop: () -> Void

    @Environment(\.tabViewBottomAccessoryPlacement) private var placement

    /// Beside a minimized tab bar there's only room for one line.
    private var compact: Bool { placement == .inline }

    var body: some View {
        HStack(spacing: 4) {
            Button {
                CookSessionStore.shared.resume()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "frying.pan.fill")
                        .foregroundStyle(Color.brand)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(session.recipeTitle)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        if !compact {
                            // Beside a timer there's less room; the step
                            // matters more than the reminder to resume.
                            ViewThatFits(in: .horizontal) {
                                Text("Resume cooking · \(session.place)")
                                Text("Resume · \(session.place)")
                                Text(session.place)
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 4)
                    nextTimer
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Goes back to cook mode")
            .accessibilityIdentifier("resumeCooking")

            if !compact {
                Button("Stop cooking", systemImage: "xmark", action: onStop)
                    .labelStyle(.iconOnly)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 36, height: 36)
                    .contentShape(.rect)
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("stopCooking")
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, compact ? 16 : 6)
    }

    /// The timer that finishes next, or a bell once one has.
    @ViewBuilder private var nextTimer: some View {
        if !session.progress.timers.isEmpty {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let running = session.runningTimers(at: context.date).min { $0.ends < $1.ends }
                Group {
                    if let running {
                        Label(CookTimer.clock(running.remaining(at: context.date)), systemImage: "timer")
                            .foregroundStyle(Color.brand)
                            .accessibilityLabel("\(running.label) timer, \(CookTimer.clock(running.remaining(at: context.date))) left")
                    } else {
                        Label("Done", systemImage: "bell.and.waves.left.and.right.fill")
                            .foregroundStyle(.orange)
                            .accessibilityLabel("Timers done")
                    }
                }
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .contentTransition(.numericText(countsDown: true))
            }
        }
    }
}

extension View {
    /// Presents cook mode for the whole app from `CookSessionStore`, and asks
    /// before one recipe replaces another that's still being cooked.
    func hostsCookMode() -> some View { modifier(CookModeHost()) }

    /// Shows the recipe set aside in a bar above a tab view's tab bar.
    func cookResumeAccessory() -> some View { modifier(CookResumeAccessory(floating: false)) }

    /// Shows the recipe set aside in a bar floating at the bottom, where
    /// there's no tab bar to sit on.
    func cookResumeOverlay() -> some View { modifier(CookResumeAccessory(floating: true)) }

    /// Asks whether to stop the recipe in flight for the one just asked for.
    /// `isActive` is true on whichever screen is in front.
    func asksBeforeSwitchingRecipes(isActive: Bool = true) -> some View { modifier(CookSwitchPrompt(isActive: isActive)) }
}

/// One recipe is in cook mode at a time and it can be opened from any tab, a
/// notification or the Live Activity, so the presentation lives at the root.
private struct CookModeHost: ViewModifier {
    @Environment(Kitchen.self) private var kitchen

    func body(content: Content) -> some View {
        let sessions = CookSessionStore.shared
        let showing = sessions.showing
        content
            .fullScreenCover(item: Binding(get: { showing.map(ShownCook.init) }, set: { if $0 == nil { sessions.setAside() } })) { shown in
                CookModeCover(id: shown.id)
                    .id(shown.id)
                    .kitchenEnvironment(kitchen)
            }
            .asksBeforeSwitchingRecipes(isActive: showing == nil)
    }
}

private struct ShownCook: Identifiable {
    let id: UUID
}

/// Cook mode on the session being shown. The session is read once as cook
/// mode opens; from then on cook mode holds the cook's place and reports
/// changes back.
private struct CookModeCover: View {
    let id: UUID

    @Environment(Kitchen.self) private var kitchen
    @State private var session = CookSessionStore.shared.session

    var body: some View {
        if let session, session.id == id, let recipe = kitchen.recipe(id: session.recipeID), !kitchen.wasDeletedElsewhere(recipe) {
            CookModeView(recipe: recipe, session: session, meal: session.mealID.flatMap { kitchen.plannedMeal(id: $0) })
        } else {
            ContentUnavailableView {
                Label("This recipe is gone", systemImage: "trash")
            } description: {
                Text("It was deleted, so there's nothing to pick back up.")
            } actions: {
                Button("Close") { CookSessionStore.shared.end() }
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

private struct CookSwitchPrompt: ViewModifier {
    let isActive: Bool
    /// The recipe the cook chose to switch to, started once the sheet is gone.
    @State private var chosen: CookSession?

    func body(content: Content) -> some View {
        let sessions = CookSessionStore.shared
        let waiting = isActive ? sessions.waiting : nil
        let current = sessions.session
        content.sheet(item: Binding(get: { waiting }, set: { if $0 == nil { sessions.dropWaiting() } })) { next in
            ConfirmSheet(systemImage: "frying.pan", title: "You're still cooking \(current?.recipeTitle ?? "a recipe")",
                         message: Self.message(next: next, current: current),
                         action: "Stop and cook \(next.recipeTitle)", cancel: "Keep cooking",
                         actionIdentifier: "switchRecipe") {
                chosen = next
            }
            .onDisappear {
                guard let chosen else { return }
                self.chosen = nil
                sessions.startOver(with: chosen)
            }
        }
    }

    static func message(next: CookSession, current: CookSession?) -> String {
        let timers = current?.runningTimers(at: .now).count ?? 0
        let lost = timers == 0 ? "your place in it is cleared" : "its \(timers == 1 ? "timer stops" : "\(timers) timers stop") and your place in it is cleared"
        return "If you start \(next.recipeTitle), \(lost)."
    }
}

private struct CookResumeAccessory: ViewModifier {
    /// Floats over the content instead of sitting on a tab bar.
    let floating: Bool
    @State private var stopping: CookSession?

    func body(content: Content) -> some View {
        let sessions = CookSessionStore.shared
        // Nothing to resume while cook mode itself is showing.
        let aside = sessions.showing == nil ? sessions.session : nil
        Group {
            if #available(iOS 26.1, *), !floating {
                content.tabViewBottomAccessory(isEnabled: aside != nil) {
                    if let aside { CookResumeBar(session: aside) { stopping = aside } }
                }
            } else {
                // iOS 26.0 can't hide a tab view's accessory, and on a Mac
                // there's no tab bar.
                content.overlay(alignment: .bottom) {
                    if let aside {
                        CookResumeBar(session: aside) { stopping = aside }
                            .frame(maxWidth: 440, minHeight: 52)
                            .glassEffect(.regular.interactive(), in: .capsule)
                            .padding(.horizontal, 20)
                            .padding(.bottom, floating ? 16 : 64)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .animation(.snappy, value: aside?.id)
            }
        }
        .sheet(item: $stopping) { session in
            let timers = session.runningTimers(at: .now).count
            ConfirmSheet(systemImage: "frying.pan", title: "Stop cooking \(session.recipeTitle)?",
                         message: timers == 0 ? "Your place in the recipe is cleared."
                             : "Your place in the recipe is cleared and \(timers == 1 ? "its timer stops" : "its \(timers) timers stop").",
                         action: "Stop cooking", cancel: "Keep cooking", actionIdentifier: "confirmStopCooking") {
                sessions.end()
            }
        }
    }
}

extension Kitchen {
    func recipe(id: UUID) -> Recipe? {
        try? context.fetch(FetchDescriptor<Recipe>(predicate: #Predicate { $0.uuid == id })).first
    }

    func plannedMeal(id: UUID) -> PlannedMeal? {
        try? context.fetch(FetchDescriptor<PlannedMeal>(predicate: #Predicate { $0.uuid == id })).first
    }

    /// Opens cook mode on a planned meal's recipe, at the meal's servings.
    func startCooking(_ meal: PlannedMeal) {
        guard let recipe = recipe(for: meal) else { return }
        CookSessionStore.shared.start(recipe, scale: scale(for: meal), meal: meal)
    }
}
