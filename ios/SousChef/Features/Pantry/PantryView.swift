import SwiftData
import SwiftUI

struct PantryView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Query(sort: \PantryItem.name) private var items: [PantryItem]
    @State private var search = ""
    @State private var scope: LocationScope = .all
    @State private var editing: PantryItem?
    @State private var adding = false
    @State private var scanning = false
    @State private var scannedPrefill: PantryPrefill?

    enum LocationScope: Hashable {
        case all, location(StorageLocation)
    }

    private var filtered: [PantryItem] {
        items.filter { item in
            (scope == .all || scope == .location(item.location)) &&
            (search.isEmpty || item.name.localizedStandardContains(search) || (item.category ?? "").localizedStandardContains(search))
        }
    }

    private var expiringSoon: [PantryItem] {
        filtered.filter { $0.expiresOn.map { ExpiryLabel.days(until: $0) <= 5 } ?? false }
            .sorted { ($0.expiresOn ?? .distantFuture) < ($1.expiresOn ?? .distantFuture) }
    }

    var body: some View {
        NavigationStack {
            List {
                if items.isEmpty {
                    emptyState
                } else {
                    summary
                    if !expiringSoon.isEmpty && search.isEmpty {
                        Section {
                            ForEach(expiringSoon) { row($0) }
                        } header: {
                            Eyebrow("Use soon", systemImage: "clock.badge.exclamationmark")
                        }
                    }
                    ForEach(StorageLocation.allCases) { location in
                        let group = filtered.filter { $0.location == location }
                        if !group.isEmpty {
                            Section {
                                ForEach(group) { row($0) }
                            } header: {
                                Eyebrow(location.title, systemImage: location.symbol)
                            }
                        }
                    }
                    if filtered.isEmpty {
                        ContentUnavailableView.search(text: search)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Pantry")
            .searchable(text: $search, prompt: "Search your kitchen")
            .searchScopes($scope, activation: .onSearchPresentation) {
                Text("All").tag(LocationScope.all)
                ForEach(StorageLocation.allCases) { Text($0.title).tag(LocationScope.location($0)) }
            }
            .toolbar {
                SettingsToolbarButton(showSettings: $showSettings)
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { scanning = true } label: { Label("Scan barcode", systemImage: "barcode.viewfinder") }
                    Button { adding = true } label: { Label("Add item", systemImage: "plus") }
                        .accessibilityIdentifier("addPantryItem")
                }
            }
            .refreshable { await kitchen.server.syncNow() }
            .sheet(isPresented: $adding) { PantryItemEditor(item: nil) }
            .sheet(item: $editing) { PantryItemEditor(item: $0) }
            .sheet(isPresented: $scanning) {
                BarcodeLookupSheet { prefill in
                    scanning = false
                    scannedPrefill = prefill
                }
            }
            .sheet(item: $scannedPrefill) { PantryItemEditor(item: nil, prefill: $0) }
        }
    }

    private var summary: some View {
        Section {
            HStack(spacing: 12) {
                ForEach(StorageLocation.allCases) { location in
                    let count = items.filter { $0.location == location }.count
                    Button {
                        withAnimation(.snappy) { scope = scope == .location(location) ? .all : .location(location) }
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Image(systemName: location.symbol)
                                .font(.title3)
                                .foregroundStyle(scope == .location(location) ? .white : Color.brand)
                            Text("\(count)")
                                .font(.title2.weight(.bold).monospacedDigit())
                                .contentTransition(.numericText())
                            Text(location.title).font(.caption).foregroundStyle(scope == .location(location) ? .white.opacity(0.85) : .secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .foregroundStyle(scope == .location(location) ? .white : .primary)
                        .background(scope == .location(location) ? Color.brand : Color.brandSoft, in: .rect(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private func row(_ item: PantryItem) -> some View {
        Button { editing = item } label: {
            HStack(spacing: 12) {
                IconBadge(systemImage: CategoryStyle.symbol(for: item.category, name: item.name), tint: item.quantity <= 0 ? .secondary : .brand)
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                    HStack(spacing: 8) {
                        if let category = item.category { Text(category).font(.caption).foregroundStyle(.secondary) }
                        ExpiryLabel(date: item.expiresOn)
                    }
                }
                Spacer()
                Text(item.quantity <= 0 ? "Out" : Units.amount(item.quantity, item.unit))
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(item.quantity <= 0 ? .red : .secondary)
                    .contentTransition(.numericText())
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) {
                kitchen.delete(item)
                kitchen.changed()
            } label: { Label("Delete", systemImage: "trash") }
            Button {
                kitchen.addShopping(item.name)
            } label: { Label("To list", systemImage: "cart.badge.plus") }
            .tint(.blue)
        }
        .swipeActions(edge: .leading) {
            Button { withAnimation { kitchen.adjust(item, by: -step(for: item)) } } label: { Label("Use", systemImage: "minus") }
                .tint(.orange)
            Button { withAnimation { kitchen.adjust(item, by: step(for: item)) } } label: { Label("Add", systemImage: "plus") }
                .tint(.brand)
        }
        .contextMenu {
            Button { kitchen.addShopping(item.name) } label: { Label("Add to shopping list", systemImage: "cart.badge.plus") }
            Button(role: .destructive) { kitchen.delete(item); kitchen.changed() } label: { Label("Delete", systemImage: "trash") }
        }
    }

    private func step(for item: PantryItem) -> Double {
        switch Units.find(item.unit)?.kind {
        case .mass where normalizeName(item.unit) == "g": 50
        case .volume where normalizeName(item.unit) == "ml": 50
        default: 1
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Your kitchen is empty", systemImage: "cabinet")
        } description: {
            Text("Add what's in your pantry, fridge and freezer. Sous Chef uses it to find recipes you can cook now.")
        } actions: {
            Button("Add an item") { adding = true }.buttonStyle(.glassProminent)
            Button("Scan a barcode") { scanning = true }.buttonStyle(.glass)
        }
        .listRowBackground(Color.clear)
    }
}

enum CategoryStyle {
    static func symbol(for category: String?, name: String) -> String {
        let text = ((category ?? "") + " " + name).lowercased()
        let rules: [(String, String)] = [
            ("produce|apple|banana|lettuce|tomato|onion|carrot|fruit|vegetable|herb|lemon|potato", "carrot"),
            ("dairy|milk|cheese|yogurt|butter|cream", "drop"),
            ("egg", "oval.portrait"),
            ("meat|seafood|chicken|beef|pork|fish|salmon", "fish"),
            (#"frozen|\bice\b"#, "snowflake"),
            ("bakery|bread|bagel|tortilla", "birthday.cake"),
            ("beverage|juice|coffee|tea|soda|water|wine|beer", "cup.and.saucer"),
            ("canned|can", "cylinder"),
            ("grain|rice|oat|flour|cereal", "takeoutbag.and.cup.and.straw"),
            ("pasta|noodle|spaghetti", "fork.knife"),
            ("spice|seasoning|salt|pepper", "leaf"),
            ("condiment|sauce|oil|vinegar|ketchup", "waterbottle"),
            ("snack|chip|cookie|chocolate", "popcorn"),
        ]
        return rules.first { text.range(of: $0.0, options: .regularExpression) != nil }?.1 ?? "basket"
    }
}
