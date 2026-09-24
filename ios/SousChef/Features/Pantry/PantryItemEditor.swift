import SwiftData
import SwiftUI

/// Values found by a barcode lookup, used to start a new pantry item.
struct PantryPrefill: Identifiable {
    let id = UUID()
    var name = ""
    var brand: String?
    var quantity: Double?
    var unit: String?
    var location: StorageLocation?
    var barcode: String?
    var category: String?
    var facts: FoodFacts?
    var notes: String?
    var nutrition: Nutrition?

    /// Open Food Facts lists brands comma-separated, owner last ("Fairlife, The Coca-Cola Company").
    static func primaryBrand(_ brands: String) -> String {
        brands.split(separator: ",").first.map { $0.trimmingCharacters(in: .whitespaces) } ?? brands
    }
}

struct PantryItemEditor: View {
    let item: PantryItem?
    var prefill: PantryPrefill?

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \PantryItem.name) private var existing: [PantryItem]

    @State private var name = ""
    @State private var quantity: Double? = 1
    @State private var unit = "each"
    @State private var location: StorageLocation = .pantry
    @State private var expiresOn: Date?
    @State private var brand = ""
    @State private var category: String?
    @State private var notes = ""
    @State private var barcode = ""
    @State private var nutrition = Nutrition()
    @State private var facts: FoodFacts?
    @State private var scanning = false
    @State private var lookupError: String?
    @State private var loaded = false
    @FocusState private var nameFocused: Bool

    private var suggestions: [String] {
        guard item == nil, name.count >= 2 else { return [] }
        let names = Set(existing.map(\.name)).filter { $0.localizedStandardContains(name) && normalizeName($0) != normalizeName(name) }
        return Array(names).sorted().prefix(4).map { $0 }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What is it?", text: $name, axis: .vertical)
                        .font(.system(.title, design: .rounded, weight: .bold))
                        .focused($nameFocused)
                        .submitLabel(.done)
                        .accessibilityIdentifier("pantryName")
                    TextField("Brand (optional)", text: $brand)
                        .textInputAutocapitalization(.words)
                        .accessibilityIdentifier("pantryBrand")
                    if !suggestions.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(suggestions, id: \.self) { suggestion in
                                    Button { name = suggestion } label: { Chip(text: suggestion, systemImage: "arrow.up.left") }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                } header: {
                    Eyebrow(item == nil ? "New item" : "Item")
                }

                Section {
                    HStack {
                        TextField("Amount", value: $quantity, format: .number.precision(.fractionLength(0...3)))
                            .keyboardType(.decimalPad)
                            .font(.title3.monospacedDigit())
                            .accessibilityIdentifier("pantryQuantity")
                        Stepper("", onIncrement: { quantity = (quantity ?? 0) + 1 }, onDecrement: { quantity = max(0, (quantity ?? 0) - 1) })
                            .labelsHidden()
                    }
                    UnitPicker(unit: $unit)
                } header: {
                    Eyebrow("Amount")
                }

                Section {
                    Picker("Location", selection: $location) {
                        ForEach(StorageLocation.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    ExpiryField(date: $expiresOn)
                    Picker(selection: $category) {
                        Text("None").tag(String?.none)
                        ForEach(ShoppingCategories.all, id: \.self) { Text($0).tag(String?.some($0)) }
                    } label: {
                        Label("Category", systemImage: "square.grid.2x2")
                    }
                } header: {
                    Eyebrow("Where")
                }

                Section {
                    HStack {
                        TextField("Barcode", text: $barcode)
                            .keyboardType(.numberPad)
                        Button { scanning = true } label: { Image(systemName: "barcode.viewfinder") }
                            .buttonStyle(.borderless)
                        if !barcode.isEmpty {
                            Button("Look up") { Task { await lookup(barcode) } }
                                .buttonStyle(.borderless)
                        }
                    }
                    if let lookupError { Text(lookupError).font(.footnote).foregroundStyle(.orange) }
                    if let facts { FoodFactsView(facts: facts) }
                } header: {
                    Eyebrow("Barcode")
                } footer: {
                    if facts != nil {
                        Text("Product facts from Open Food Facts, available under the Open Database License.")
                    }
                }

                Section {
                    DisclosureGroup {
                        ForEach(Nutrition.fields, id: \.label) { field in
                            LabeledContent(field.label) {
                                HStack(spacing: 4) {
                                    TextField("—", value: Binding(get: { nutrition[keyPath: field.key] }, set: { nutrition[keyPath: field.key] = $0 }), format: .number.precision(.fractionLength(0...2)))
                                        .keyboardType(.decimalPad)
                                        .multilineTextAlignment(.trailing)
                                    Text(field.unit).foregroundStyle(.secondary).font(.caption)
                                }
                            }
                        }
                    } label: {
                        Label("Nutrition per 100 g", systemImage: "chart.bar.doc.horizontal")
                    }
                } footer: {
                    Text("Shared by every batch of this food. Recipes use it to estimate nutrition.")
                }

                Section {
                    TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...5)
                } header: {
                    Eyebrow("Notes")
                }

                if let item {
                    Section {
                        Button(role: .destructive) {
                            kitchen.delete(item)
                            kitchen.changed()
                            dismiss()
                        } label: {
                            Label("Delete item", systemImage: "trash")
                        }
                    }
                }
            }
            .navigationTitle(item == nil ? "Add to kitchen" : "Edit item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", role: .confirm) { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityIdentifier("savePantryItem")
                }
            }
            .sheet(isPresented: $scanning) {
                BarcodeLookupSheet { found in
                    scanning = false
                    apply(found)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        if let item {
            name = item.name
            quantity = item.quantity
            unit = item.unit
            location = item.location
            expiresOn = item.expiresOn
            brand = item.brand ?? ""
            category = item.category
            notes = item.notes ?? ""
            barcode = item.barcode ?? ""
            nutrition = item.nutrition ?? Nutrition()
            facts = item.foodFacts
        } else if let prefill {
            apply(prefill)
        } else {
            nameFocused = true
        }
    }

    private func apply(_ prefill: PantryPrefill) {
        if !prefill.name.isEmpty { name = prefill.name }
        if let value = prefill.brand ?? prefill.facts?.brand.map(PantryPrefill.primaryBrand), brand.isEmpty { brand = value }
        if let value = prefill.quantity { quantity = value }
        if let value = prefill.unit { unit = value }
        if let value = prefill.location { location = value }
        barcode = prefill.barcode ?? barcode
        category = prefill.category ?? category
        facts = prefill.facts ?? facts
        if let value = prefill.notes, notes.isEmpty { notes = value }
        if nutrition.isEmpty, let facts = prefill.nutrition ?? prefill.facts?.nutrition { nutrition = facts }
    }

    private func lookup(_ code: String) async {
        lookupError = nil
        do {
            let result = try await OpenFoodFacts.lookup(code)
            apply(PantryPrefill(name: name.isEmpty ? result.name : name, barcode: code, category: result.category, facts: result.facts))
        } catch {
            lookupError = error.localizedDescription
        }
    }

    private func save() {
        let target = item ?? PantryItem(name: name)
        target.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        target.quantity = max(0, quantity ?? 0)
        target.unit = unit
        target.location = location
        target.expiresOn = expiresOn
        target.brand = brand.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        target.category = category
        target.notes = notes.nilIfEmpty
        target.barcode = barcode.nilIfEmpty
        target.foodFacts = facts
        // Nutrition describes the food, so every batch in the kitchen shares it.
        let shared: Nutrition? = nutrition.isEmpty ? nil : nutrition
        if target.nutrition != shared {
            for batch in kitchen.fetch(PantryItem.self) where normalizeName(batch.name) == normalizeName(target.name) && batch !== target {
                batch.nutrition = shared
                batch.touch()
            }
        }
        target.nutrition = shared
        target.touch()
        if item == nil { kitchen.context.insert(target) }
        kitchen.changed()
        dismiss()
    }
}

struct UnitPicker: View {
    @Binding var unit: String
    var allowNone = false

    var body: some View {
        Picker(selection: $unit) {
            if allowNone { Text("None").tag("") }
            if !unit.isEmpty && Units.find(unit) == nil { Text(unit).tag(unit) }
            ForEach(Units.pickerGroups, id: \.title) { group in
                Section(group.title) {
                    ForEach(group.units) { option in
                        Text(option.abbr.flatMap { $0 == option.name ? nil : "\(option.name) (\($0))" } ?? option.name).tag(option.label)
                    }
                }
            }
        } label: {
            Label("Unit", systemImage: "scalemass")
        }
        .pickerStyle(.menu)
    }
}

struct FoodFactsView: View {
    let facts: FoodFacts

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if let grade = facts.nutriscoreGrade?.uppercased(), grade.count == 1 { Chip(text: "Nutri-Score \(grade)", tint: nutriColor(grade)) }
                if let nova = facts.novaGroup { Chip(text: "NOVA \(nova)", tint: .secondary) }
            }
            if let allergens = facts.allergensTags, !allergens.isEmpty {
                Text("Allergens: " + allergens.map { $0.replacingOccurrences(of: "en:", with: "") }.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
    }

    private func nutriColor(_ grade: String) -> Color {
        switch grade {
        case "A": .green
        case "B": .mint
        case "C": .yellow
        case "D": .orange
        default: .red
        }
    }
}
