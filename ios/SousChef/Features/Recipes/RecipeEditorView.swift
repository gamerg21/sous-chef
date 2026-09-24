import PhotosUI
import SwiftData
import SwiftUI

struct RecipeEditorView: View {
    @State var draft: RecipeDraft
    let recipe: Recipe?
    var onSave: (Recipe) -> Void = { _ in }

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \PantryItem.name) private var pantry: [PantryItem]
    @State private var photoItem: PhotosPickerItem?
    @State private var newIngredient = ""
    @State private var newStep = ""
    @State private var newTag = ""
    @State private var editingIngredient: Ingredient?
    @FocusState private var focus: Field?

    enum Field { case title, ingredient, step, tag }

    private var pantryNames: [String] {
        Array(Set(pantry.map(\.name))).sorted()
    }

    var body: some View {
        NavigationStack {
            Form {
                if !draft.warnings.isEmpty {
                    Section {
                        ForEach(draft.warnings, id: \.self) { Label($0, systemImage: "exclamationmark.triangle").font(.callout).foregroundStyle(.orange) }
                    } header: {
                        Eyebrow("Check before saving")
                    }
                }

                Section {
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        RecipeImage(data: draft.photo, symbol: "camera")
                            .frame(height: 170)
                            .frame(maxWidth: .infinity)
                            .clipShape(.rect(cornerRadius: 16, style: .continuous))
                            .overlay(alignment: .bottomTrailing) {
                                Label(draft.photo == nil ? "Add photo" : "Change", systemImage: "photo")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 10).padding(.vertical, 6)
                                    .glassEffect(.regular, in: .capsule)
                                    .padding(10)
                            }
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    if draft.photo != nil {
                        Button("Remove photo", role: .destructive) { draft.photo = nil }
                    }
                    TextField("Recipe title", text: $draft.title, axis: .vertical)
                        .font(.system(.title2, design: .rounded, weight: .bold))
                        .focused($focus, equals: .title)
                        .accessibilityIdentifier("recipeTitle")
                    TextField("Short description", text: Binding(get: { draft.summary ?? "" }, set: { draft.summary = $0 }), axis: .vertical)
                        .lineLimit(1...4)
                } header: {
                    Eyebrow("Recipe")
                }

                Section {
                    Stepper(value: Binding(get: { draft.servings ?? 0 }, set: { draft.servings = $0 == 0 ? nil : $0 }), in: 0...48) {
                        LabeledContent("Servings", value: draft.servings.map(String.init) ?? "—")
                    }
                    Stepper(value: Binding(get: { draft.totalTimeMinutes ?? 0 }, set: { draft.totalTimeMinutes = $0 == 0 ? nil : $0 }), in: 0...1440, step: 5) {
                        LabeledContent("Total time", value: draft.totalTimeMinutes.map { "\($0) min" } ?? "—")
                    }
                } header: {
                    Eyebrow("Details")
                }

                Section {
                    ForEach($draft.ingredients) { $ingredient in
                        Button { editingIngredient = ingredient } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(ingredient.name).foregroundStyle(.primary)
                                    if let label = ingredient.mappingLabel?.nilIfEmpty, normalizeName(label) != normalizeName(ingredient.name) {
                                        Label("Uses \(label)", systemImage: "link").font(.caption).foregroundStyle(Color.brand)
                                    } else if let note = ingredient.note?.nilIfEmpty {
                                        Text(note).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                Text(Units.amount(ingredient.quantity, ingredient.unit)).foregroundStyle(.secondary).monospacedDigit()
                            }
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                    .onDelete { draft.ingredients.remove(atOffsets: $0) }
                    .onMove { draft.ingredients.move(fromOffsets: $0, toOffset: $1) }
                    HStack {
                        TextField("Add ingredient, e.g. 2 cups flour", text: $newIngredient)
                            .focused($focus, equals: .ingredient)
                            .submitLabel(.next)
                            .onSubmit(addIngredient)
                            .accessibilityIdentifier("newIngredient")
                        Button(action: addIngredient) { Image(systemName: "plus.circle.fill") }
                            .disabled(newIngredient.nilIfEmpty == nil)
                    }
                } header: {
                    Eyebrow("Ingredients · \(draft.ingredients.count)")
                } footer: {
                    Text("Type amounts naturally. Tap an ingredient to link it to a pantry item with a different name.")
                }

                Section {
                    ForEach($draft.steps) { $step in
                        TextField("Step", text: $step.text, axis: .vertical)
                    }
                    .onDelete { draft.steps.remove(atOffsets: $0) }
                    .onMove { draft.steps.move(fromOffsets: $0, toOffset: $1) }
                    HStack {
                        TextField("Add a step", text: $newStep, axis: .vertical)
                            .focused($focus, equals: .step)
                        Button(action: addStep) { Image(systemName: "plus.circle.fill") }
                            .disabled(newStep.nilIfEmpty == nil)
                    }
                } header: {
                    Eyebrow("Steps · \(draft.steps.count)")
                }

                Section {
                    if !draft.tags.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(draft.tags, id: \.self) { tag in
                                    Button { draft.tags.removeAll { $0 == tag } } label: { Chip(text: tag, systemImage: "xmark") }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    TextField("Add tag", text: $newTag)
                        .focused($focus, equals: .tag)
                        .textInputAutocapitalization(.never)
                        .onSubmit {
                            let tag = newTag.lowercased().trimmingCharacters(in: .whitespaces)
                            if !tag.isEmpty && !draft.tags.contains(tag) { draft.tags.append(tag) }
                            newTag = ""
                            focus = .tag
                        }
                } header: {
                    Eyebrow("Tags")
                }

                Section {
                    optionalNumber("Calories", "kcal", $draft.caloriesKcal)
                    optionalNumber("Protein", "g", $draft.proteinGrams)
                    optionalNumber("Carbs", "g", $draft.carbsGrams)
                    optionalNumber("Fat", "g", $draft.fatGrams)
                } header: {
                    Eyebrow("Nutrition per serving")
                } footer: {
                    Text("Leave blank to estimate from pantry nutrition facts.")
                }

                Section {
                    TextField("Source link", text: Binding(get: { draft.sourceURL ?? "" }, set: { draft.sourceURL = $0 }))
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                    TextField("Notes", text: Binding(get: { draft.notes ?? "" }, set: { draft.notes = $0 }), axis: .vertical)
                        .lineLimit(2...6)
                } header: {
                    Eyebrow("Source & notes")
                }
            }
            .navigationTitle(recipe == nil ? "New recipe" : "Edit recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", role: .confirm, action: save)
                        .disabled(draft.title.nilIfEmpty == nil)
                        .accessibilityIdentifier("saveRecipe")
                }
            }
            .sheet(item: $editingIngredient) { ingredient in
                IngredientEditor(ingredient: ingredient, pantryNames: pantryNames) { updated in
                    if let index = draft.ingredients.firstIndex(where: { $0.id == updated.id }) { draft.ingredients[index] = updated }
                }
            }
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) { draft.photo = ImageTools.compressed(data) }
                }
            }
            .onAppear { if recipe == nil && draft.title.isEmpty { focus = .title } }
        }
    }

    private func optionalNumber(_ title: String, _ unit: String, _ value: Binding<Double?>) -> some View {
        LabeledContent(title) {
            HStack(spacing: 4) {
                TextField("—", value: value, format: .number.precision(.fractionLength(0...1)))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                Text(unit).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func addIngredient() {
        guard let line = newIngredient.nilIfEmpty else { return }
        var ingredient = IngredientParser.parse(line)
        if let match = pantryNames.first(where: { normalizeName($0) == normalizeName(ingredient.name) }) { ingredient.name = match }
        withAnimation { draft.ingredients.append(ingredient) }
        newIngredient = ""
        focus = .ingredient
    }

    private func addStep() {
        guard let text = newStep.nilIfEmpty else { return }
        withAnimation { draft.steps.append(RecipeStep(text: text)) }
        newStep = ""
        focus = .step
    }

    private func save() {
        let saved = kitchen.save(draft, into: recipe)
        dismiss()
        onSave(saved)
    }
}

struct IngredientEditor: View {
    @State var ingredient: Ingredient
    let pantryNames: [String]
    let onSave: (Ingredient) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Ingredient", text: $ingredient.name)
                        .font(.title3.weight(.semibold))
                    TextField("Amount", value: $ingredient.quantity, format: .number.precision(.fractionLength(0...3)))
                        .keyboardType(.decimalPad)
                    UnitPicker(unit: Binding(get: { ingredient.unit ?? "" }, set: { ingredient.unit = $0.isEmpty ? nil : $0 }), allowNone: true)
                    TextField("Note (e.g. finely chopped)", text: Binding(get: { ingredient.note ?? "" }, set: { ingredient.note = $0.nilIfEmpty }))
                }
                Section {
                    Picker(selection: Binding(get: { ingredient.mappingLabel ?? "" }, set: { ingredient.mappingLabel = $0.isEmpty ? nil : $0 })) {
                        Text("Same name").tag("")
                        ForEach(pantryNames, id: \.self) { Text($0).tag($0) }
                    } label: {
                        Label("Pantry item", systemImage: "link")
                    }
                } header: {
                    Eyebrow("Uses from pantry")
                } footer: {
                    Text("Link this ingredient when your pantry calls it something else, like “Cheddar” for “cheese”.")
                }
            }
            .navigationTitle("Ingredient")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", role: .confirm) {
                        onSave(ingredient)
                        dismiss()
                    }
                    .disabled(ingredient.name.nilIfEmpty == nil)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
