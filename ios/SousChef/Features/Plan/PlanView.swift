import SwiftData
import SwiftUI

/// The week's meal plan, reached from the Cook tab. Each day lists its meals
/// with pantry readiness; the week's shortages go to the shopping list in one go.
struct PlanView: View {
    @Environment(Kitchen.self) private var kitchen
    @State private var weekStart = MealPlanner.weekStart()
    @State private var planningDay: PlanDay?
    @State private var toast: Toast?

    var body: some View {
        PlanWeekList(weekStart: weekStart, onPlan: { planningDay = PlanDay(id: $0) }, onCook: { kitchen.startCooking($0) }, onAddShortages: addShortages)
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
            .toast($toast)
            .sheet(item: $planningDay) { day in
                PlanRecipePicker(day: day.id)
                    .kitchenEnvironment(kitchen)
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
        toast = Toast(MealPlanner.listToast(added: result.added, updated: result.updated))
    }
}

