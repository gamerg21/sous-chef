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
    /// Set when saving would run an item past its date out: ask what happened first.
    @State private var askingOutcome: PantryItem?
    /// Set when deleting an item that's past its date and in stock.
    @State private var askingRemoval: PantryItem?
    @FocusState private var nameFocused: Bool

    private var suggestions: [String] {
        guard item == nil, name.count >= 2 else { return [] }
        let names = Set(existing.map(\.name)).filter { $0.localizedStandardContains(name) && normalizeName($0) != normalizeName(name) }
        return Array(names).sorted().prefix(4).map { $0 }
    }

    var body: some View {
        // Another device may delete the item while this is open.
        DeletedElsewhereGuard(item) { screen }
    }

    private var screen: some View {
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
                        ScrollView(.horizontal) {
                            HStack {
                                ForEach(suggestions, id: \.self) { suggestion in
                                    Button { name = suggestion } label: { Chip(text: suggestion, systemImage: "arrow.up.left") }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                        .scrollIndicators(.hidden)
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
                    if item == nil, let choices = facts?.packaging?.choices, !choices.isEmpty {
                        PackageChoices(choices: choices, quantity: $quantity, unit: $unit)
                    }
                } header: {
                    Eyebrow("Amount")
                } footer: {
                    if let summary = facts.flatMap(PackageText.summary) { Text(summary) }
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
                        Button("Scan barcode", systemImage: "barcode.viewfinder") { scanning = true }
                            .labelStyle(.iconOnly)
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
                        Label(facts?.nutritionBasis == "100ml" ? "Nutrition per 100 ml" : "Nutrition per 100 g", systemImage: "chart.bar.doc.horizontal")
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
                            if kitchen.asksBeforeRemoving(item) {
                                askingRemoval = item
                            } else {
                                kitchen.delete(item, undoable: true)
                                kitchen.changed()
                                dismiss()
                            }
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
                .kitchenEnvironment(kitchen)
            }
            .onAppear(perform: load)
            .pastDatePrompt(for: $askingOutcome) { _, kind in save(outcome: kind) }
            .pastDatePrompt(for: $askingRemoval) { item, kind in
                kitchen.settle(item, as: kind)
                dismiss()
            }
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
            // An item that's out has no date, even one saved before that rule.
            expiresOn = item.quantity > 0 ? item.expiresOn : nil
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
        // A product this kitchen has stocked before comes back named, counted
        // and placed the way the household did it last time.
        let stocked = item == nil ? prefill.barcode.flatMap(stockedItem) : nil
        // Until the user changes it, a new item's amount follows the package.
        let untouched = item == nil && quantity == 1 && unit == "each"
        let found = prefill.facts ?? stocked?.foodFacts
        let defaults = ProductParser.defaults(found, previousUnit: stocked?.unit)
        if let stocked { name = stocked.name } else if !prefill.name.isEmpty { name = prefill.name }
        if let value = stocked?.brand ?? prefill.brand ?? found?.brand.map(PantryPrefill.primaryBrand), brand.isEmpty { brand = value }
        if let value = prefill.quantity {
            quantity = value
        } else if untouched, let choice = defaults.choice {
            quantity = choice.quantity
            unit = choice.unit
        } else if untouched, let stocked {
            unit = stocked.unit
        }
        if let value = prefill.unit { unit = value }
        if let value = prefill.location {
            location = value
        } else if let stocked {
            location = stocked.location
        } else if item == nil, location == .pantry, let suggested = defaults.location {
            location = suggested
        }
        barcode = prefill.barcode ?? barcode
        category = stocked?.category ?? prefill.category ?? category
        facts = found ?? facts
        if let value = prefill.notes, notes.isEmpty { notes = value }
        if nutrition.isEmpty, let facts = prefill.nutrition ?? found?.nutrition { nutrition = facts }
    }

    /// The newest item already stocked under a barcode.
    private func stockedItem(_ code: String) -> PantryItem? {
        guard !code.isEmpty else { return nil }
        return existing.filter { $0.barcode == code }.max { $0.createdAt < $1.createdAt }
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

    /// `outcome` answers the past-date prompt when saving runs the item out.
    private func save(outcome: PantryOutcome.Kind? = nil) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let newQuantity = max(0, quantity ?? 0)
        if let item, item.quantity > 0, newQuantity <= 0 {
            if let outcome {
                kitchen.recordOutcome(outcome, name: trimmed, expiresOn: expiresOn)
            } else if !kitchen.countRunningOut(name: trimmed, expiresOn: expiresOn, from: item.quantity, to: newQuantity) {
                askingOutcome = item
                return
            }
        }
        let target = item ?? PantryItem(name: name)
        target.name = trimmed
        target.setQuantity(newQuantity)
        target.unit = unit
        target.location = location
        target.expiresOn = newQuantity > 0 ? expiresOn : nil
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
        Picker(selection: canonical($unit)) {
            UnitOptions(unit: unit, allowNone: allowNone)
        } label: {
            Label("Unit", systemImage: "scalemass")
        }
        .pickerStyle(.menu)
    }
}

/// A compact unit menu that reads as part of the amount ("2 tsp ⌄").
struct UnitMenu: View {
    @Binding var unit: String

    var body: some View {
        Menu {
            Picker("Unit", selection: canonical($unit)) {
                UnitOptions(unit: unit, allowNone: false)
            }
        } label: {
            HStack(spacing: 4) {
                Text(unit.isEmpty ? "unit" : (Units.find(unit)?.label ?? unit))
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down").imageScale(.small)
            }
            .font(.body.weight(.semibold))
            .foregroundStyle(Color.brand)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Color.brandSoft, in: .capsule)
            // Keep "bunch" or "fl oz" on one line; the item name wraps instead.
            .fixedSize()
        }
        .accessibilityLabel("Unit")
        .accessibilityValue(unit)
    }
}

/// Shows a stored spelling like "teaspoons" as its catalog unit ("tsp"),
/// so the menu has a matching row instead of looking blank.
private func canonical(_ unit: Binding<String>) -> Binding<String> {
    Binding { Units.find(unit.wrappedValue)?.label ?? unit.wrappedValue } set: { unit.wrappedValue = $0 }
}

private struct UnitOptions: View {
    let unit: String
    let allowNone: Bool

    var body: some View {
        if allowNone { Text("None").tag("") }
        if !unit.isEmpty && Units.find(unit) == nil { Text(unit).tag(unit) }
        ForEach(Units.pickerGroups, id: \.title) { group in
            Section(group.title) {
                ForEach(group.units) { option in
                    Text(option.abbr.flatMap { $0 == option.name ? nil : "\(option.name) (\($0))" } ?? option.name).tag(option.label)
                }
            }
        }
    }
}

struct FoodFactsView: View {
    let facts: FoodFacts

    private var perServing: String? {
        guard let values = facts.nutritionPerServing else { return nil }
        let parts = [(values.energyKcal, "kcal"), (values.proteinG, "g protein"), (values.carbsG, "g carbs"), (values.fatG, "g fat")]
            .compactMap { value, unit in value.map { "\(Units.format(ProductParser.tidy($0))) \(unit)" } }
        guard !parts.isEmpty else { return nil }
        let size = facts.serving.flatMap { serving in serving.amount.map { "\(Units.format($0)) \(serving.unit ?? "g")" } ?? serving.text }
        return "Per serving\(size.map { " (\($0))" } ?? ""): " + parts.joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                // Product photos come from Open Food Facts, so they follow its setting.
                if OpenFoodFacts.enabled, let url = (facts.imageFrontSmallUrl ?? facts.imageFrontUrl).flatMap(URL.init(string:)) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        Color.secondary.opacity(0.1)
                    }
                    .frame(width: 56, height: 56)
                    .background(.white, in: .rect(cornerRadius: 10))
                    .clipShape(.rect(cornerRadius: 10))
                    .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        if let grade = facts.nutriscoreGrade?.uppercased(), grade.count == 1 { Chip(text: "Nutri-Score \(grade)", tint: nutriColor(grade)) }
                        if let nova = facts.novaGroup { Chip(text: "NOVA \(nova)", tint: .secondary) }
                    }
                    let badges = ProductParser.badges(facts)
                    if !badges.isEmpty {
                        ScrollView(.horizontal) {
                            HStack { ForEach(badges, id: \.self) { Chip(text: $0) } }
                        }
                        .scrollIndicators(.hidden)
                    }
                }
            }
            if let perServing {
                Text(perServing).font(.caption).foregroundStyle(.secondary)
            }
            if let allergens = facts.allergensTags, !allergens.isEmpty {
                Text("Allergens: " + allergens.map(PackageText.tag).joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            if let traces = facts.tracesTags, !traces.isEmpty {
                Text("May contain: " + traces.map(PackageText.tag).joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let storage = facts.storageText {
                Text("Storage: " + storage).font(.caption).foregroundStyle(.secondary)
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

/// One tap to count a package as cans, by its printed size or as one box,
/// and a stepper for how many packages are going in.
private struct PackageChoices: View {
    let choices: [PackageChoice]
    @Binding var quantity: Double?
    @Binding var unit: String

    private var selected: PackageChoice? { choices.first { $0.unit == (Units.find(unit)?.label ?? unit) } }

    /// Whole packages the amount adds up to, when it's a clean multiple.
    private var packages: Int? {
        guard let selected, let quantity, quantity > 0 else { return nil }
        let count = quantity / selected.quantity
        return abs(count - count.rounded()) < 0.001 && count >= 1 ? Int(count.rounded()) : nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ScrollView(.horizontal) {
                HStack {
                    ForEach(choices, id: \.self) { choice in
                        Button {
                            // Read before the unit changes what `packages` means.
                            let count = packages ?? 1
                            unit = choice.unit
                            quantity = choice.quantity * Double(count)
                        } label: {
                            Chip(text: PackageText.amount(choice.quantity, choice.unit), selected: choice == selected)
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(choice == selected ? .isSelected : [])
                    }
                }
            }
            .scrollIndicators(.hidden)
            .accessibilityLabel("Count it as")
            if let selected, let packages {
                Stepper(packages == 1 ? "1 package" : "\(packages) packages",
                        onIncrement: { quantity = selected.quantity * Double(packages + 1) },
                        onDecrement: { quantity = selected.quantity * Double(max(1, packages - 1)) })
                    .accessibilityIdentifier("pantryPackages")
            }
        }
    }
}

/// Wording for package details: "12 cans · 12 fl oz each".
enum PackageText {
    private static let plurals = ["can": "cans", "jar": "jars", "bottle": "bottles", "box": "boxes", "bag": "bags"]

    static func amount(_ quantity: Double, _ unit: String) -> String {
        let shown = quantity == 1 ? unit : plurals[unit] ?? unit
        return unit == "each" ? "\(Units.format(quantity)) each" : "\(Units.format(quantity)) \(shown)"
    }

    /// Tag text for display: "en:soybeans" → "soybeans".
    static func tag(_ tag: String) -> String { ProductParser.words(tag) }

    static func summary(_ facts: FoodFacts) -> String? {
        var parts: [String] = []
        if let pack = facts.packaging {
            if let count = pack.count, count > 1, let container = pack.container {
                let each = pack.eachAmount.map { "\(Units.format($0)) \(pack.eachUnit ?? "") each" }
                parts.append(([amount(Double(count), container)] + [each].compactMap { $0 }).joined(separator: " · "))
            } else if let text = pack.text ?? pack.amount.map({ "\(Units.format($0)) \(pack.unit ?? "")" }) {
                parts.append(text)
            }
        }
        if let serving = facts.serving, let per = serving.perPackage, per >= 2, let size = serving.amount {
            parts.append("About \(Units.format(per)) servings of \(Units.format(size)) \(serving.unit ?? "g")")
        }
        return parts.isEmpty ? nil : "From the package: " + parts.joined(separator: ". ") + "."
    }
}
