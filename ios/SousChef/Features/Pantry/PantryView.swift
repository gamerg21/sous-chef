import SwiftData
import SwiftUI

struct PantryView: View {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dynamicTypeSize) private var typeSize
    @Query(sort: \PantryItem.name) private var items: [PantryItem]
    @Query private var outcomes: [PantryOutcome]
    @State private var search = ""
    @State private var filter = PantryFilter()
    @State private var editing: PantryItem?
    @State private var adding = false
    @State private var scanning = false
    @State private var scannedPrefill: PantryPrefill?
    /// An item past its date that "Use" would run out: ask what happened.
    @State private var askingOutcome: PantryItem?
    @AppStorage(ExpiringFood.windowDaysKey, store: ExpiringFood.settings) private var windowDays = ExpiringFood.defaultWindowDays
    @AppStorage(PantrySort.storageKey) private var sort: PantrySort = .name
    private var navigator = AppNavigator.shared
    /// Unfolded or on a wide screen, the kitchen's numbers sit beside or above the list.
    @State private var layout = PaneLayout.single
    /// How an iPhone Duo is being held.
    @State private var posture = FoldPosture.flat
    /// The unfolded Duo held upright and open flat is one screen: the numbers
    /// top the list as a strip that scrolls away, and the list takes the
    /// width in two columns. Propped like a laptop, they go back to the half
    /// standing up.
    private var flat: Bool { layout.companionStepsAside(in: posture) }
    /// With the at-a-glance pane beside or above the list.
    private var twoPane: Bool { layout.isSplit && !flat }
    /// The whole at-a-glance pane, opened from the strip.
    @State private var showingGlance = false
    /// An item opened from the at-a-glance sheet, edited over it.
    @State private var editingFromGlance: PantryItem?
    /// How wide the list is, for how many items fit across a row.
    @State private var listWidth: CGFloat = 0
    @ScaledMetric(relativeTo: .body) private var minimumCellWidth: CGFloat = 250

    enum LocationScope: Hashable {
        case all, location(StorageLocation)
    }

    private var filtered: [PantryItem] { filter.matching(items, search: search) }

    /// In-stock items expiring within the cook's window, soonest first.
    private var expiringSoon: [PantryItem] { PantryFilter.expiring(in: filtered, within: windowDays) }

    /// Items side by side in a row: two when the list has the upright Duo's
    /// width and they still fit, else one. The inset list leaves a margin
    /// each side.
    private var columns: Int {
        guard flat, !typeSize.isAccessibilitySize else { return 1 }
        return ColumnFit.count(width: listWidth - 40, minimumWidth: minimumCellWidth, maximum: 2)
    }

    var body: some View {
        CompanionSplit(layout: layout, companionAside: flat) {
            list
        } companion: {
            PantryInsightsPane(items: items, outcomes: outcomes, windowDays: windowDays, scope: $filter.scope) { editing = $0 }
        }
        .tracksPaneLayout($layout)
        .tracksFoldPosture($posture)
        // Laid flat or propped up, the pane slides away or back.
        .animation(.snappy, value: flat)
        // Only the strip has "use soon", so it stops filtering without it.
        .onChange(of: flat) { if !flat { filter.useSoon = false } }
    }

    private var list: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                Group {
                    if flat && columns > 1 && !items.isEmpty {
                        flatGrid
                    } else {
                        listContent
                    }
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { listWidth = $0 }
                // An expiry reminder's "Show in Pantry" lands on "Use soon", right under the summary.
                .onChange(of: navigator.revealExpiringInPantry, initial: true) { _, reveal in
                    guard reveal else { return }
                    navigator.revealExpiringInPantry = false
                    search = ""
                    filter = PantryFilter()
                    withAnimation { proxy.scrollTo(Self.topID, anchor: .top) }
                }
            }
            .navigationTitle("Pantry")
            // Inline on the lower half of an upright Duo, which is short.
            .paneTitleDisplayMode(layout == .stacked && !flat)
            .searchable(text: $search, prompt: "Search your kitchen")
            .searchScopes($filter.scope, activation: .onSearchPresentation) {
                Text("All").tag(LocationScope.all)
                ForEach(StorageLocation.allCases) { Text($0.title).tag(LocationScope.location($0)) }
            }
            .toolbar {
                SettingsToolbarButton(showSettings: $showSettings)
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort by", selection: $sort.animation()) {
                            ForEach(PantrySort.allCases) { Label($0.title, systemImage: $0.symbol).tag($0) }
                        }
                    } label: { Label("Sort", systemImage: "arrow.up.arrow.down") }
                        .accessibilityIdentifier("sortPantry")
                    Button { scanning = true } label: { Label("Scan barcode", systemImage: "barcode.viewfinder") }
                    Button { adding = true } label: { Label("Add item", systemImage: "plus") }
                        .accessibilityIdentifier("addPantryItem")
                }
            }
            .refreshable { await kitchen.server.syncNow() }
            .sheet(isPresented: $adding) { PantryItemEditor(item: nil, defaultLocation: filter.location).kitchenEnvironment(kitchen) }
            .sheet(item: $editing) { PantryItemEditor(item: $0).kitchenEnvironment(kitchen) }
            .sheet(isPresented: $scanning) {
                BarcodeLookupSheet { prefill in
                    scanning = false
                    scannedPrefill = prefill
                }
                .kitchenEnvironment(kitchen)
            }
            .sheet(item: $scannedPrefill) { PantryItemEditor(item: nil, prefill: $0, defaultLocation: filter.location).kitchenEnvironment(kitchen) }
            .pastDatePrompt(for: $askingOutcome) { item, kind in withAnimation { kitchen.settle(item, as: kind) } }
            .sheet(isPresented: $showingGlance) { glanceSheet }
        }
    }

    private var listContent: some View {
        List {
            if items.isEmpty {
                emptyState
            } else if flat {
                flatSections
            } else {
                // Beside the at-a-glance pane, its location bar does this.
                if !twoPane { summary }
                if !expiringSoon.isEmpty && search.isEmpty { useSoonSection }
                if search.isEmpty && !twoPane { outcomeTally }
                locationSections
                if filtered.isEmpty {
                    ContentUnavailableView.search(text: search)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: Sections

    private var useSoonSection: some View {
        Section {
            ForEach(expiringSoon) { row($0) }
        } header: {
            Eyebrow("Use soon", systemImage: "clock.badge.exclamationmark")
        }
    }

    /// What's run out, after the places food is kept: each place lists what
    /// it has, so it matches the count on its tile.
    private var outOfStock: [PantryItem] { sort.sorted(filtered.filter { $0.quantity <= 0 }) }

    private func inStock(in location: StorageLocation) -> [PantryItem] {
        sort.sorted(filtered.filter { $0.location == location && $0.quantity > 0 })
    }

    @ViewBuilder private var locationSections: some View {
        ForEach(StorageLocation.allCases) { location in
            let group = inStock(in: location)
            if !group.isEmpty {
                Section {
                    ForEach(group) { row($0) }
                } header: {
                    Eyebrow(location.title, systemImage: location.symbol)
                }
            }
        }
        if !outOfStock.isEmpty {
            Section {
                ForEach(outOfStock) { row($0) }
            } header: {
                Eyebrow("Out of stock", systemImage: "tray")
                    .accessibilityIdentifier("pantryOutOfStock")
            }
        }
    }

    // MARK: Laid flat

    // The upright Duo laid flat: the glance strip in place of the summary,
    // then the list as on a phone, two items to a row while they fit. The
    // strip's "use soon" shows only that section. The month's tally stays
    // in the list, with the pane it's otherwise on tucked away in a sheet,
    // but steps aside while the list is filtered, since it isn't about
    // what's shown.

    /// A section of the list laid flat.
    private struct FlatGroup: Identifiable {
        var id: String
        var title: String
        var symbol: String
        var items: [PantryItem]
    }

    /// "Use soon" first, when it shows.
    private var flatUseSoon: FlatGroup? {
        guard !expiringSoon.isEmpty, filter.useSoon || search.isEmpty else { return nil }
        return FlatGroup(id: "useSoon", title: "Use soon", symbol: "clock.badge.exclamationmark", items: expiringSoon)
    }

    private var flatLocations: [FlatGroup] {
        guard !filter.useSoon else { return [] }
        var groups = StorageLocation.allCases.compactMap { location in
            let group = inStock(in: location)
            return group.isEmpty ? nil : FlatGroup(id: location.rawValue, title: location.title, symbol: location.symbol, items: group)
        }
        if !outOfStock.isEmpty {
            groups.append(FlatGroup(id: "outOfStock", title: "Out of stock", symbol: "tray", items: outOfStock))
        }
        return groups
    }

    private var showsTally: Bool { search.isEmpty && !filter.isFiltering }

    private var flatIsEmpty: Bool { filter.useSoon ? expiringSoon.isEmpty : filtered.isEmpty }

    private var glanceStrip: some View {
        PantryGlanceStrip(items: items, windowDays: windowDays, filter: $filter) { showingGlance = true }
            .id(Self.topID)
    }

    /// What the list is narrowed to, and the way back to everything.
    private func filterBar(_ title: String) -> some View {
        AdaptiveStack(verticalSpacing: 6) {
            Label("Showing \(title)", systemImage: filter.symbol)
                .font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("pantryFilterTitle")
            Button("Show all") { withAnimation(.snappy) { filter = PantryFilter() } }
                .font(.subheadline.weight(.semibold))
                .accessibilityIdentifier("pantryShowAll")
        }
    }

    /// Laid flat with large text, one item to a row: a list, so rows swipe.
    @ViewBuilder private var flatSections: some View {
        Section {
            glanceStrip
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
        } header: {
            PantryGlanceStrip.header { showingGlance = true }
        }
        if let title = filter.title {
            Section { filterBar(title) }
        }
        if let group = flatUseSoon { useSoonSection.id(group.id) }
        if showsTally { outcomeTally }
        if !filter.useSoon { locationSections }
        if flatIsEmpty { filteredEmpty }
    }

    /// Laid flat, two items to a row. Grouped like the list, but out of
    /// one: a list lifts a whole row for a long press, and each item here
    /// needs a menu of its own, standing in for the swipes a row of two
    /// can't have.
    private var flatGrid: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                groupHeader { PantryGlanceStrip.header { showingGlance = true } }
                glanceStrip
                if let title = filter.title {
                    filterBar(title)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: Self.groupCorner, style: .continuous))
                        .padding(.top, 20)
                        .transition(.opacity)
                }
                if let group = flatUseSoon { flatGroup(group) }
                if showsTally, let tally = tallyLine {
                    groupHeader { Eyebrow("This month", systemImage: "chart.bar") }
                    tally
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: Self.groupCorner, style: .continuous))
                }
                ForEach(flatLocations) { flatGroup($0) }
                if flatIsEmpty {
                    filteredEmpty.padding(.top, 40)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
    }

    /// Like an inset list's corners.
    private static let groupCorner: CGFloat = 26

    private func groupHeader(@ViewBuilder _ content: () -> some View) -> some View {
        content()
            .padding(.horizontal, 20)
            .padding(.top, 24)
            .padding(.bottom, 8)
    }

    private func flatGroup(_ group: FlatGroup) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            groupHeader { Eyebrow(group.title, systemImage: group.symbol) }
            let rows = group.items.rows(of: columns)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.first?.id) { index, row in
                    if index > 0 { Divider().padding(.leading, 16) }
                    HStack(spacing: 0) {
                        ForEach(Array(row.enumerated()), id: \.element.id) { column, item in
                            if column > 0 { Divider() }
                            cell(item)
                        }
                        if row.count < columns {
                            Divider().opacity(0)
                            Color.clear.frame(maxWidth: .infinity)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(.rect(cornerRadius: Self.groupCorner, style: .continuous))
        }
        .id(group.id)
    }

    /// Nothing left once the list is filtered: what isn't there, and the way back.
    @ViewBuilder private var filteredEmpty: some View {
        if !search.isEmpty {
            ContentUnavailableView.search(text: search)
        } else {
            let location = filter.location
            ContentUnavailableView {
                if let location {
                    Label("Nothing in the \(location.title.lowercased())", systemImage: location.symbol)
                } else {
                    Label("Nothing to use soon", systemImage: "leaf")
                }
            } description: {
                if location != nil {
                    Text("What you keep there shows up here.")
                } else {
                    Text("Nothing in stock expires in the next \(windowDays == 1 ? "day" : "\(windowDays) days").")
                }
            } actions: {
                Button("Show everything") { withAnimation(.snappy) { filter = PantryFilter() } }
                    .buttonStyle(.glass)
                    .fixedSize()
            }
            .listRowBackground(Color.clear)
            .accessibilityIdentifier("pantryFilteredEmpty")
        }
    }

    /// The whole at-a-glance pane, from the strip's "See all". Its places
    /// still filter the list underneath.
    private var glanceSheet: some View {
        PantryInsightsPane(items: items, outcomes: outcomes, windowDays: windowDays, scope: $filter.scope, closes: true) { editingFromGlance = $0 }
            .sheet(item: $editingFromGlance) { PantryItemEditor(item: $0).kitchenEnvironment(kitchen) }
            .kitchenEnvironment(kitchen)
    }

    /// "This month: 3 used · 1 thrown away", like the web's Use it up card.
    @ViewBuilder
    private var outcomeTally: some View {
        if let tallyLine {
            Section {
                tallyLine
            } header: {
                Eyebrow("This month", systemImage: "chart.bar")
            }
        }
    }

    /// The tally itself; nil before anything's been used or thrown away this month.
    private var tallyLine: AnyView? {
        let tally = PantryOutcome.tally(outcomes, month: PantryOutcome.month())
        guard tally.used + tally.wasted > 0 else { return nil }
        return AnyView(
            HStack(spacing: 6) {
                Text("\(tally.used) used").foregroundStyle(Color.brand)
                Text("·").foregroundStyle(.secondary)
                Text("\(tally.wasted) thrown away").foregroundStyle(tally.wasted > 0 ? .red : .primary)
            }
            .font(.callout.weight(.medium).monospacedDigit())
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("outcomeTally")
        )
    }

    private var summary: some View {
        Section {
            // Stacked once large text won't fit three across.
            AdaptiveStack(spacing: 12) {
                ForEach(StorageLocation.allCases) { location in
                    let count = items.filter { $0.location == location }.count
                    Button {
                        withAnimation(.snappy) { filter.toggle(.location(location)) }
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Image(systemName: location.symbol)
                                .font(.title3)
                                .foregroundStyle(filter.isOn(.location(location)) ? .white : Color.brand)
                            Text("\(count)")
                                .font(.title2.weight(.bold).monospacedDigit())
                                .contentTransition(.numericText())
                            Text(location.title).font(.caption).foregroundStyle(filter.isOn(.location(location)) ? .white.opacity(0.85) : .secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .foregroundStyle(filter.isOn(.location(location)) ? .white : .primary)
                        .background(filter.isOn(.location(location)) ? Color.brand : Color.brandSoft, in: .rect(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("pantryScope-\(location.rawValue)")
                    .accessibilityAddTraits(filter.isOn(.location(location)) ? .isSelected : [])
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .id(Self.topID)
        }
    }

    private static let topID = "pantry-summary"

    private func row(_ item: PantryItem) -> some View {
        itemButton(item)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { remove(item) } label: { Label("Delete", systemImage: "trash") }
                .tint(.red)
            Button {
                kitchen.addShopping(item.name)
            } label: { Label("To list", systemImage: "cart.badge.plus") }
            .tint(.blue)
        }
        .swipeActions(edge: .leading) {
            Button {
                use(item)
            } label: { Label("Use", systemImage: "minus") }
                .tint(.orange)
            Button { withAnimation { kitchen.adjust(item, by: step(for: item)) } } label: { Label("Add", systemImage: "plus") }
                .tint(.brand)
        }
        .contextMenu { actions(for: item) }
    }

    /// An item beside another, out of a list, so it can't swipe: its
    /// long-press menu and accessibility actions do what a row's swipes do.
    private func cell(_ item: PantryItem) -> some View {
        itemButton(item)
            .padding(.horizontal, 16)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground))
            .contentShape(.rect)
            .contentShape(.contextMenuPreview, .rect(cornerRadius: 14, style: .continuous))
            .contextMenu {
                let amount = Units.amount(step(for: item), item.unit)
                Section {
                    Button { use(item) } label: { Label("Use \(amount)", systemImage: "minus") }
                    Button { withAnimation { kitchen.adjust(item, by: step(for: item)) } } label: { Label("Add \(amount)", systemImage: "plus") }
                }
                actions(for: item)
            }
            .accessibilityAction(named: "Use \(Units.amount(step(for: item), item.unit))") { use(item) }
            .accessibilityAction(named: "Add to shopping list") { kitchen.addShopping(item.name) }
    }

    @ViewBuilder private func actions(for item: PantryItem) -> some View {
        if item.quantity > 0, PantryOutcome.whenEmptied(expiresOn: item.expiresOn) == .ask {
            Button { withAnimation { kitchen.settle(item, as: .used) } } label: { Label("Used", systemImage: "checkmark.circle") }
            Button { withAnimation { kitchen.settle(item, as: .wasted) } } label: { Label("Thrown away", systemImage: "xmark.bin") }
        }
        Button { kitchen.addShopping(item.name) } label: { Label("Add to shopping list", systemImage: "cart.badge.plus") }
        Button(role: .destructive) { remove(item) } label: { Label("Delete", systemImage: "trash") }
    }

    private func use(_ item: PantryItem) {
        withAnimation { if !kitchen.adjust(item, by: -step(for: item)) { askingOutcome = item } }
    }

    private func itemButton(_ item: PantryItem) -> some View {
        Button { editing = item } label: {
            // At accessibility sizes the row grows tall, so the badge sits
            // by the name instead of floating in the middle.
            HStack(alignment: typeSize.isAccessibilitySize ? .top : .center, spacing: 12) {
                IconBadge(systemImage: CategoryStyle.symbol(for: item.category, name: item.name), tint: item.quantity <= 0 ? .secondary : .brand)
                // With large text in a narrow pane, the quantity drops below
                // and the details stack, rather than squeezing the name.
                TrailingDetailRow(spacing: 4) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.name).font(.body.weight(.medium)).foregroundStyle(.primary)
                        AdaptiveStack(spacing: 8) {
                            if let detail = item.brand ?? item.category { Text(detail).font(.caption).foregroundStyle(.secondary) }
                            ExpiryLabel(date: item.quantity > 0 ? item.expiresOn : nil)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(item.quantity <= 0 ? "Out" : Units.amount(item.quantity, item.unit))
                        .font(.callout.monospacedDigit())
                        .foregroundStyle(item.quantity <= 0 ? .red : .secondary)
                        .contentTransition(.numericText())
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }

    /// Deletes the item, except that food past its date that's still in stock
    /// asks "Used" or "Thrown away" and stays as Out.
    private func remove(_ item: PantryItem) {
        if kitchen.asksBeforeRemoving(item) {
            askingOutcome = item
        } else {
            kitchen.delete(item, undoable: true)
            kitchen.changed()
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
            Button("Add an item") { adding = true }.buttonStyle(.glassProminent).fixedSize()
            Button("Scan a barcode") { scanning = true }.buttonStyle(.glass).fixedSize()
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
