import SwiftUI

/// Plans one recipe: a day, a meal, and how many servings.
struct AddToPlanSheet: View {
    let recipe: Recipe
    var onAdded: (String) -> Void = { _ in }

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date.now
    @State private var slot = MealSlot.dinner
    @State private var servings = 2

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Day", selection: $date, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
                        .datePickerStyle(.graphical)
                }
                Section {
                    Picker("Meal", selection: $slot) {
                        ForEach(MealSlot.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                    }
                    Stepper(value: $servings, in: 1...48) {
                        Text("\(servings) serving\(servings == 1 ? "" : "s")").monospacedDigit()
                    }
                }
            }
            .navigationTitle("Add to Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", systemImage: "checkmark", role: .confirm, action: add)
                }
            }
            .onAppear { servings = recipe.servings ?? servings }
        }
        .presentationDetents([.large])
    }

    private func add() {
        let day = MealPlanner.day(date)
        kitchen.plan(recipe, on: day, slot: slot, servings: servings)
        onAdded("Planned for \(slot.title.lowercased()) \(date.formatted(.dateTime.weekday(.wide)))")
        dismiss()
    }
}
