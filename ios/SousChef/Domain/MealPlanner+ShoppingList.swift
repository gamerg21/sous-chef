import Foundation

/// How a week's shortages meet the shopping list: what the list still lacks
/// and the changes that add it. The plan cards and `Kitchen.addWeekShortages`
/// both read `listGap`, so a card never offers what the button won't do.
extension MealPlanner {
    /// What the merge reads from a shopping list row.
    struct ListRow: Equatable {
        var id: UUID
        var name: String
        var quantity: Double?
        var unit: String?
        var checked = false
        var note: String?
        var createdAt = Date.distantPast
    }

    struct ListGap: Equatable {
        struct Addition: Equatable { var name: String; var quantity: Double?; var unit: String?; var note: String? }
        /// A row's amount and note after the merge.
        struct Update: Equatable { var id: UUID; var quantity: Double?; var unit: String?; var note: String? }

        /// The shortages asked about, and how many the list already has in full.
        var needs = 0
        var covered = 0
        var additions: [Addition] = []
        var updates: [Update] = []

        var remaining: Int { needs - covered }
    }

    /// What the list still lacks for `shortages`, keeping one row per food.
    /// Rows for the same food (`FoodWords.key`, so "Carrots" counts for
    /// "carrot") in a comparable unit count toward a need, including ones
    /// already in the cart; any extra tops up an unticked row, the oldest
    /// first. An unticked row in a unit that can't be compared (500 g against
    /// 1 carrot) keeps its amount and carries the extra in its note instead
    /// of gaining a second row. Applying the result and asking again finds
    /// nothing left to do.
    static func listGap(for shortages: [CookingPlan.Missing], on rows: [ListRow]) -> ListGap {
        struct Line {
            var row: ListRow
            /// Nil for a row this merge adds.
            var original: ListRow?
            var key: String
            /// Amounts the row can't add to its own.
            var extras: [String] = []
        }
        var lines = rows.sorted { ($0.createdAt, $0.id.uuidString) < ($1.createdAt, $1.id.uuidString) }
            .map { Line(row: $0, original: $0, key: FoodWords.key($0.name)) }
        // Per shortage: whether it changed a row's amount or added one, and the row whose note carries it.
        var outcomes: [(changed: Bool, noted: Int?)] = []
        for need in shortages {
            let key = FoodWords.key(need.name)
            let sameFood = lines.indices.filter { lines[$0].key == key }
            guard let quantity = need.quantity else {
                if sameFood.isEmpty {
                    lines.append(Line(row: ListRow(id: UUID(), name: need.name, unit: need.unit), key: key))
                }
                outcomes.append((sameFood.isEmpty, nil))
                continue
            }
            let comparable = sameFood.filter { lines[$0].row.quantity != nil && Units.convert(1, from: lines[$0].row.unit, to: need.unit) != nil }
            let covered = comparable.reduce(0.0) { $0 + (Units.convert(lines[$1].row.quantity ?? 0, from: lines[$1].row.unit, to: need.unit) ?? 0) }
            guard covered + 0.000001 < quantity else {
                outcomes.append((false, nil))
                continue
            }
            let extra = quantity - covered
            if let open = comparable.first(where: { !lines[$0].row.checked }) {
                let more = Units.convert(extra, from: need.unit, to: lines[open].row.unit) ?? 0
                lines[open].row.quantity = rounded((lines[open].row.quantity ?? 0) + more)
                outcomes.append((true, nil))
            } else if let unmeasured = sameFood.first(where: { !lines[$0].row.checked && lines[$0].row.quantity == nil }) {
                lines[unmeasured].row.quantity = rounded(extra)
                lines[unmeasured].row.unit = need.unit
                outcomes.append((true, nil))
            } else if let other = sameFood.first(where: { !lines[$0].row.checked }) {
                lines[other].extras.append(Units.amount(rounded(extra), need.unit))
                outcomes.append((false, other))
            } else {
                lines.append(Line(row: ListRow(id: UUID(), name: need.name, quantity: rounded(extra), unit: need.unit), key: key))
                outcomes.append((true, nil))
            }
        }

        var gap = ListGap(needs: shortages.count)
        var renoted: Set<Int> = []
        for index in lines.indices {
            if !lines[index].extras.isEmpty {
                lines[index].row.note = planNote(lines[index].extras, after: lines[index].row.note)
            }
            let row = lines[index].row
            guard let original = lines[index].original else {
                gap.additions.append(.init(name: row.name, quantity: row.quantity, unit: row.unit, note: row.note))
                renoted.insert(index)
                continue
            }
            guard row != original else { continue }
            gap.updates.append(.init(id: row.id, quantity: row.quantity, unit: row.unit, note: row.note))
            if row.note != original.note { renoted.insert(index) }
        }
        gap.covered = outcomes.filter { outcome in
            !outcome.changed && !(outcome.noted.map { renoted.contains($0) } ?? false)
        }.count
        return gap
    }

    /// The note for a row carrying `amounts` it can't add to its own ("plus 1
    /// for planned meals"), after whatever else the note says. An earlier plan
    /// note is replaced, not added to, so a changed need doesn't pile up.
    static func planNote(_ amounts: [String], after note: String?) -> String {
        let plan = "plus \(amounts.joined(separator: " and ")) for planned meals"
        return withoutPlanNote(note).map { "\($0); \(plan)" } ?? plan
    }

    /// A row's note without the part `planNote` wrote.
    static func withoutPlanNote(_ note: String?) -> String? {
        note?.replacingOccurrences(of: #"(^|;\s*)plus [^;]+ for planned meals\s*$"#, with: "", options: [.regularExpression, .caseInsensitive]).nilIfEmpty
    }

    /// What to say once the week's shortages have gone onto the list.
    static func listToast(added: Int, updated: Int) -> String {
        func items(_ count: Int) -> String { "\(count) item\(count == 1 ? "" : "s")" }
        switch (added, updated) {
        case (0, 0): return "Your list already covers this week"
        case (_, 0): return "Added \(items(added)) to your list"
        case (0, _): return "Topped up \(items(updated)) on your list"
        default: return "Added \(added) and topped up \(updated) on your list"
        }
    }
}
