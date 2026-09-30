import SwiftData
import SwiftUI

/// Picks a recipe to plan on a given day, for a chosen meal.
struct PlanRecipePicker: View {
    let day: String

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Recipe.title) private var recipes: [Recipe]
    @State private var slot = MealSlot.dinner
    @State private var search = ""

    private var matches: [Recipe] {
        let query = search.trimmingCharacters(in: .whitespaces)
        let list = query.isEmpty ? recipes : recipes.filter { $0.title.localizedStandardContains(query) }
        return list.sorted { $0.favorited && !$1.favorited }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Meal", selection: $slot) {
                        ForEach(MealSlot.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section {
                    ForEach(matches) { recipe in
                        Button {
                            kitchen.plan(recipe, on: day, slot: slot)
                            UINotificationFeedbackGenerator().notificationOccurred(.success)
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                RecipeImage(data: recipe.photo)
                                    .frame(width: 44, height: 44)
                                    .clipShape(.rect(cornerRadius: 10, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(recipe.title).foregroundStyle(.primary)
                                    if let servings = recipe.servings {
                                        Text("Serves \(servings)").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                if recipe.favorited {
                                    Image(systemName: "heart.fill").foregroundStyle(.pink).accessibilityLabel("Favorite")
                                }
                            }
                        }
                    }
                } header: {
                    Eyebrow("Recipes", systemImage: "book.pages")
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $search, prompt: "Search recipes")
            .overlay {
                if recipes.isEmpty {
                    ContentUnavailableView("No recipes yet", systemImage: "book.pages", description: Text("Add recipes first, then plan them here."))
                } else if matches.isEmpty {
                    ContentUnavailableView.search(text: search)
                }
            }
            .navigationTitle(MealPlanner.date(day).formatted(.dateTime.weekday(.wide).day().month()))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                }
            }
        }
    }
}
