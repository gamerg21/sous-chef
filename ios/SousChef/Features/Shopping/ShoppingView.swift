import SwiftData
import SwiftUI

struct ShoppingView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Query(sort: \ShoppingItem.createdAt) private var items: [ShoppingItem]
    @Query private var recipes: [Recipe]
    @State private var newItem = ""
    @State private var editing: ShoppingItem?
    @State private var stocking = false
    @State private var sorting = false
    @State private var confirmClear = false
    @State private var error: String?
    @FocusState private var addFocused: Bool

    private var open: [ShoppingItem] { items.filter { !$0.checked } }
    private var inCart: [ShoppingItem] { items.filter(\.checked) }

    private var groups: [(category: String, items: [ShoppingItem])] {
        let grouped = Dictionary(grouping: open) { $0.category ?? "Other" }
        let order = ShoppingCategories.all
        return grouped.keys.sorted { (order.firstIndex(of: $0) ?? 99, $0) < (order.firstIndex(of: $1) ?? 99, $1) }
            .map { ($0, grouped[$0]!) }
    }

    var body: some View {
        NavigationStack {
            List {
                if items.isEmpty {
                    ContentUnavailableView {
                        Label("Your list is empty", systemImage: "cart")
                    } description: {
                        Text("Add items below, or add what a recipe is missing from its page.")
                    }
                    .listRowBackground(Color.clear)
                }
                if let error {
                    ErrorBanner(message: error).listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                }
                ForEach(groups, id: \.category) { group in
                    Section {
                        ForEach(group.items) { row($0) }
                    } header: {
                        Eyebrow(group.category, systemImage: CategoryStyle.symbol(for: group.category, name: ""))
                    }
                }
                if !inCart.isEmpty {
                    Section {
                        ForEach(inCart) { row($0) }
                        Button {
                            stocking = true
                        } label: {
                            Label("Put \(inCart.count) away in the pantry", systemImage: "cabinet")
                                .font(.body.weight(.semibold))
                        }
                        .accessibilityIdentifier("stockPurchases")
                    } header: {
                        Eyebrow("In the cart · \(inCart.count)", systemImage: "checkmark.circle")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Shopping")
            .animation(.snappy, value: items.map(\.checked))
            .toolbar {
                SettingsToolbarButton(showSettings: $showSettings)
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if kitchen.ai.isAvailable {
                            Button { Task { await sortIntoAisles() } } label: { Label("Sort into aisles", systemImage: "apple.intelligence") }
                                .disabled(open.isEmpty || sorting)
                        }
                        Button { stocking = true } label: { Label("Put purchases away", systemImage: "cabinet") }
                            .disabled(inCart.isEmpty)
                        ShareLink(item: shareText) { Label("Share list", systemImage: "square.and.arrow.up") }
                            .disabled(open.isEmpty)
                        Divider()
                        Button(role: .destructive) { confirmClear = true } label: { Label("Clear checked", systemImage: "trash") }
                            .disabled(inCart.isEmpty)
                    } label: {
                        if sorting { ProgressView() } else { Label("More", systemImage: "ellipsis") }
                    }
                }
            }
            .safeAreaInset(edge: .bottom) { addBar }
            .refreshable { await kitchen.server.syncNow() }
            .sheet(item: $editing) { ShoppingItemEditor(item: $0) }
            .sheet(isPresented: $stocking) { StockPurchasesView(items: inCart) }
            .confirmationDialog("Remove \(inCart.count) checked item\(inCart.count == 1 ? "" : "s")?", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Clear checked", role: .destructive) { kitchen.clearChecked() }
            }
        }
    }

    private var addBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "plus").foregroundStyle(Color.brand)
            TextField("Add an item, e.g. 2 lb chicken", text: $newItem)
                .focused($addFocused)
                .submitLabel(.done)
                .onSubmit(add)
                .accessibilityIdentifier("addShoppingItem")
            if !newItem.isEmpty {
                Button("Add", action: add).font(.body.weight(.semibold))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .glassEffect(.regular.interactive(), in: .capsule)
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    private func row(_ item: ShoppingItem) -> some View {
        HStack(spacing: 12) {
            Button {
                withAnimation(.snappy) { kitchen.toggle(item) }
            } label: {
                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(item.checked ? Color.brand : .secondary)
                    .contentTransition(.symbolEffect(.replace))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.checked ? "Uncheck \(item.name)" : "Check \(item.name)")
            Button { editing = item } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.name)
                            .strikethrough(item.checked)
                            .foregroundStyle(item.checked ? .secondary : .primary)
                        if let recipe = recipeTitle(for: item) {
                            Label(recipe, systemImage: "book.pages").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        } else if let note = item.note?.nilIfEmpty {
                            Text(note).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Text(Units.amount(item.quantity, item.unit)).font(.callout.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
        }
        .swipeActions {
            Button(role: .destructive) {
                kitchen.delete(item)
                kitchen.changed()
            } label: { Label("Delete", systemImage: "trash") }
        }
    }

    private func recipeTitle(for item: ShoppingItem) -> String? {
        guard let id = item.recipeUUID else { return nil }
        return recipes.first { $0.uuid == id }?.title
    }

    private var shareText: String {
        (["Shopping list"] + open.map { "☐ \([Units.amount($0.quantity, $0.unit), $0.name].filter { !$0.isEmpty }.joined(separator: " "))" }).joined(separator: "\n")
    }

    private func add() {
        guard newItem.nilIfEmpty != nil else {
            addFocused = false
            return
        }
        kitchen.addShopping(newItem)
        newItem = ""
        addFocused = true
    }

    private func sortIntoAisles() async {
        sorting = true
        error = nil
        defer { sorting = false }
        do {
            let categories = try await kitchen.ai.categorize(open.map(\.name))
            for item in open {
                if let category = categories[normalizeName(item.name)], category != item.category {
                    item.category = category
                    item.touch()
                }
            }
            kitchen.changed()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ShoppingItemEditor: View {
    @Bindable var item: ShoppingItem
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var quantity: Double?
    @State private var unit = ""
    @State private var category: String?
    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Item", text: $name).font(.title3.weight(.semibold))
                    TextField("Amount", value: $quantity, format: .number.precision(.fractionLength(0...3))).keyboardType(.decimalPad)
                    UnitPicker(unit: $unit, allowNone: true)
                    Picker("Aisle", selection: $category) {
                        Text("None").tag(String?.none)
                        ForEach(ShoppingCategories.all, id: \.self) { Text($0).tag(String?.some($0)) }
                    }
                    TextField("Note", text: $note, axis: .vertical)
                }
                Section {
                    Button(role: .destructive) {
                        kitchen.delete(item)
                        kitchen.changed()
                        dismiss()
                    } label: { Label("Delete", systemImage: "trash") }
                }
            }
            .navigationTitle("Edit item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", role: .confirm) {
                        item.name = name.trimmingCharacters(in: .whitespaces)
                        item.quantity = quantity.flatMap { $0 > 0 ? $0 : nil }
                        item.unit = unit.nilIfEmpty
                        item.category = category
                        item.note = note.nilIfEmpty
                        item.touch()
                        kitchen.changed()
                        dismiss()
                    }
                    .disabled(name.nilIfEmpty == nil)
                }
            }
            .onAppear {
                name = item.name
                quantity = item.quantity
                unit = item.unit ?? ""
                category = item.category
                note = item.note ?? ""
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Reviews checked purchases and moves them into the pantry together.
struct StockPurchasesView: View {
    let items: [ShoppingItem]
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var purchases: [Kitchen.Purchase] = []

    var body: some View {
        NavigationStack {
            Form {
                ForEach($purchases) { $purchase in
                    Section {
                        HStack {
                            TextField("Amount", value: $purchase.quantity, format: .number.precision(.fractionLength(0...3)))
                                .keyboardType(.decimalPad)
                                .frame(maxWidth: 90)
                            UnitPicker(unit: $purchase.unit)
                        }
                        Picker("Store in", selection: $purchase.location) {
                            ForEach(StorageLocation.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                        }
                        .pickerStyle(.segmented)
                        Toggle("Expiry date", isOn: Binding(get: { purchase.expiresOn != nil }, set: { purchase.expiresOn = $0 ? Calendar.current.date(byAdding: .day, value: 7, to: .now) : nil }))
                        if let date = purchase.expiresOn {
                            DatePicker("Use by", selection: Binding(get: { date }, set: { purchase.expiresOn = $0 }), displayedComponents: .date)
                        }
                    } header: {
                        Eyebrow(purchase.item.name)
                    }
                }
            }
            .navigationTitle("Put purchases away")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add to pantry", role: .confirm) {
                        kitchen.stock(purchases)
                        dismiss()
                    }
                    .disabled(purchases.contains { $0.quantity <= 0 || $0.unit.isEmpty })
                    .accessibilityIdentifier("confirmStock")
                }
            }
            .onAppear {
                guard purchases.isEmpty else { return }
                purchases = items.map { item in
                    Kitchen.Purchase(item: item, quantity: item.quantity ?? 1, unit: item.unit ?? "each",
                                     location: Self.guessLocation(item), expiresOn: nil)
                }
            }
        }
    }

    static func guessLocation(_ item: ShoppingItem) -> StorageLocation {
        switch item.category {
        case "Dairy", "Meat & Seafood", "Produce": .fridge
        case "Frozen": .freezer
        default: .pantry
        }
    }
}
