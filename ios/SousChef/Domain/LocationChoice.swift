import Foundation

/// A new pantry item's location and where it came from, so a stronger reason
/// is never replaced by a weaker one and the person's own pick always stands.
nonisolated struct LocationChoice: Equatable {
    /// Weakest first.
    enum Source: Int, Comparable {
        /// Nothing known: Pantry.
        case fallback
        /// Apple Intelligence's answer for the name.
        case ai
        /// `StoragePlacement`, from the name and category.
        case rule
        /// Where the item being refilled is kept.
        case refill
        /// Storage instructions or a telling category from Open Food Facts.
        case product
        /// Where the same barcode was kept last time.
        case stockedBefore
        /// Storage instructions read from a scanned label.
        case label
        /// The location the Pantry list is filtered to.
        case filter
        /// Picked in the form.
        case user

        static func < (left: Source, right: Source) -> Bool { left.rawValue < right.rawValue }
    }

    private(set) var location: StorageLocation = .pantry
    private(set) var source: Source = .fallback
    /// What the source matched: the rule's words, the refilled item's name, or the name Apple Intelligence was asked about.
    private(set) var detail: String?

    init() {}

    /// An existing item's location, which nothing automatic may change.
    init(editing location: StorageLocation) {
        self.location = location
        source = .user
    }

    /// The person chose it in the form.
    mutating func pick(_ location: StorageLocation) {
        self = LocationChoice(editing: location)
    }

    /// Takes `location` unless something stronger already decided. The same
    /// source may answer again, as the name rule does while the name is typed.
    @discardableResult
    mutating func offer(_ location: StorageLocation?, from source: Source, detail: String? = nil) -> Bool {
        guard let location, source >= self.source else { return false }
        self.location = location
        self.source = source
        self.detail = detail
        return true
    }

    /// Forgets the location if one of `sources` set it.
    mutating func withdraw(_ sources: Source...) {
        if sources.contains(source) { self = LocationChoice() }
    }

    /// Re-runs the weaker sources after the name, category or refill target
    /// changed. `refill` is the item being refilled, when there is one.
    mutating func refresh(name: String, category: String?, refill: (location: StorageLocation, name: String)? = nil) {
        withdraw(.refill)
        if let refill { offer(refill.location, from: .refill, detail: refill.name) }
        guard source <= .rule else { return }
        if let suggestion = StoragePlacement.suggestion(name: name, category: category) {
            offer(suggestion.location, from: .rule, detail: suggestion.basis)
        } else if source == .rule || (source == .ai && normalizeName(detail) != normalizeName(name)) {
            self = LocationChoice()
        }
    }

    /// Whether Apple Intelligence should be asked about `name`: nothing else
    /// has an opinion and there's enough of a name to go on.
    func wantsAI(name: String) -> Bool {
        source == .fallback && normalizeName(name).count >= 3
    }

    /// Apple Intelligence's answer for `asked`, ignored when the name has
    /// changed since or something stronger arrived.
    @discardableResult
    mutating func answer(_ location: StorageLocation?, asked: String, name: String) -> Bool {
        guard normalizeName(asked) == normalizeName(name) else { return false }
        return offer(location, from: .ai, detail: asked)
    }

    /// A short note for under the picker when the location was set automatically.
    var reason: String? {
        switch source {
        case .fallback, .user: nil
        case .ai: "Suggested by Apple Intelligence"
        case .rule: detail.map { "Suggested for \($0)" }
        case .refill: "Where the item you're refilling is kept"
        case .product: "From the product's storage details"
        case .stockedBefore: "Where you kept it last time"
        case .label: "From the storage instructions on the label"
        case .filter: "Matches your \(location.title) filter"
        }
    }
}
