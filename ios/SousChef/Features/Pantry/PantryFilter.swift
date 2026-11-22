import Foundation

/// What the Pantry list is narrowed to: one storage location, or only what's
/// going off soon. The location comes from the summary tiles, the search's
/// scope bar or the at-a-glance pane; "use soon" only from the glance strip
/// on the unfolded iPhone Duo held upright. One at a time, so picking one
/// clears the other, and picking the one that's on shows everything again.
struct PantryFilter: Equatable {
    /// A glance tile that filters the list.
    enum Tile: Hashable {
        case useSoon
        case location(StorageLocation)
    }

    var scope: PantryView.LocationScope = .all {
        didSet { if scope != .all { useSoon = false } }
    }

    /// Only what's in stock and expires within the cook's window.
    var useSoon = false {
        didSet { if useSoon { scope = .all } }
    }

    var isFiltering: Bool { useSoon || scope != .all }

    func isOn(_ tile: Tile) -> Bool {
        switch tile {
        case .useSoon: useSoon
        case .location(let location): scope == .location(location)
        }
    }

    /// Turns a tile's filter on, or off when it's already on.
    mutating func toggle(_ tile: Tile) {
        let on = isOn(tile)
        switch tile {
        case .useSoon: useSoon = !on
        case .location(let location): scope = on ? .all : .location(location)
        }
    }

    /// The one location shown, if one's picked.
    var location: StorageLocation? {
        if case .location(let location) = scope { location } else { nil }
    }

    /// What the list says it's showing, while it's filtered.
    var title: String? {
        useSoon ? "what to use soon" : location?.title
    }

    var symbol: String {
        location?.symbol ?? "clock.badge.exclamationmark"
    }

    /// Items in the location, if one's picked, that match the search by
    /// name, brand or category. "Use soon" narrows these further, through
    /// `expiring(in:within:now:)`.
    func matching(_ items: [PantryItem], search: String) -> [PantryItem] {
        items.filter { item in
            (scope == .all || scope == .location(item.location)) &&
            (search.isEmpty || item.name.localizedStandardContains(search) || (item.brand ?? "").localizedStandardContains(search) || (item.category ?? "").localizedStandardContains(search))
        }
    }

    /// In-stock items expiring within the cook's window, soonest first.
    static func expiring(in items: [PantryItem], within windowDays: Int, now: Date = .now) -> [PantryItem] {
        let byID = Dictionary(items.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        return ExpiringFood.find(in: items.map(\.expiringStock), within: windowDays, now: now).compactMap { byID[$0.id] }
    }
}
