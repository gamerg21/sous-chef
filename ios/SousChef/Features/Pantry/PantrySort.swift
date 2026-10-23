import Foundation

/// How the Pantry orders items inside each storage location.
enum PantrySort: String, CaseIterable, Identifiable {
    case name, expiring, recent

    static let storageKey = "pantrySort"

    var id: Self { self }

    var title: String {
        switch self {
        case .name: "Name"
        case .expiring: "Expiring soonest"
        case .recent: "Recently added"
        }
    }

    var symbol: String {
        switch self {
        case .name: "textformat"
        case .expiring: "clock"
        case .recent: "sparkles"
        }
    }

    /// Ties, and items without a date, fall back to name order. Items that are
    /// out sort as undated, since their date no longer matters.
    func sorted(_ items: [PantryItem]) -> [PantryItem] {
        items.sorted { a, b in
            switch self {
            case .name:
                break
            case .expiring:
                let left = a.quantity > 0 ? a.expiresOn : nil
                let right = b.quantity > 0 ? b.expiresOn : nil
                switch (left, right) {
                case let (l?, r?) where l != r: return l < r
                case (.some, nil): return true
                case (nil, .some): return false
                default: break
                }
            case .recent:
                if a.createdAt != b.createdAt { return a.createdAt > b.createdAt }
            }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }
}
