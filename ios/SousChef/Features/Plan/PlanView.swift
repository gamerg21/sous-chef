import SwiftData
import SwiftUI

/// The week's meal plan, reached from the Cook tab. Each day lists its meals
/// with pantry readiness; the week's shortages go to the shopping list in one go.
struct PlanView: View {
    @Environment(Kitchen.self) private var kitchen
    @State private var weekStart = MealPlanner.weekStart()
    @State private var planningDay: PlanDay?
    @State private var cooking: PlannedMeal?
    @State private var toast: String?

    var body: some View {
        PlanWeekList(weekStart: weekStart, onPlan: { planningDay = PlanDay(id: $0) }, onCook: { cooking = $0 }, onAddShortages: addShortages)
            .navigationTitle(weekTitle)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button("Previous week", systemImage: "chevron.left") { move(by: -7) }
                    if weekStart != MealPlanner.weekStart() {
                        Button("This week") { withAnimation(.snappy) { weekStart = MealPlanner.weekStart() } }
                    }
                    Button("Next week", systemImage: "chevron.right") { move(by: 7) }
                }
            }
            .overlay(alignment: .top) {
                if let toast {
                    Text(toast)
                        .font(.callout.weight(.medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .glassEffect(.regular, in: .capsule)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .padding(.top, 8)
                }
            }
            .sheet(item: $planningDay) { day in
                PlanRecipePicker(day: day.id)
                    .kitchenEnvironment(kitchen)
            }
            .fullScreenCover(item: $cooking) { meal in
                if let recipe = kitchen.recipe(for: meal) {
                    CookModeView(recipe: recipe, scale: kitchen.scale(for: meal), meal: meal)
                        .kitchenEnvironment(kitchen)
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

    private func move(by days: Int) {
        withAnimation(.snappy) { weekStart = MealPlanner.day(weekStart, adding: days) }
    }

    private func addShortages() {
        let result = kitchen.addWeekShortages(from: weekStart)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        show(result.added + result.updated == 0 ? "Your list already covers this week" : "Added \(result.added), topped up \(result.updated)")
    }

    private func show(_ message: String) {
        withAnimation(.snappy) { toast = message }
        Task {
            try? await Task.sleep(for: .seconds(2.2))
            withAnimation(.snappy) { toast = nil }
        }
    }
}

