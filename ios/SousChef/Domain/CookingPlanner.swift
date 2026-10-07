import Foundation

/// One deterministic allocation shared by the preview and the inventory
/// update. A line-for-line port of `src/lib/cooking-plan.ts`.
struct CookingPlan: Equatable {
    struct Missing: Equatable, Hashable { var name: String; var quantity: Double?; var unit: String? }
    struct Check: Equatable, Hashable { var name: String; var reason: String }
    struct Deduction: Equatable, Hashable { var id: UUID; var name: String; var quantity: Double; var unit: String; var remaining: Double }

    var missingIngredients: [Missing] = []
    var checks: [Check] = []
    var deductions: [Deduction] = []
    var availableCount = 0

    var isReady: Bool { missingIngredients.isEmpty && checks.isEmpty }
}

struct StockLine {
    var id: UUID
    var name: String
    var quantity: Double
    var unit: String
    var expiresOn: Date?
}

enum CookingPlanner {
    private static let epsilon = 0.000001
    /// Converted amounts within this share of a pantry item count as the whole item:
    /// 453 g or 454 g of a 1 lb pack, or 240 ml of a 1 cup carton, uses it up instead
    /// of leaving a sliver or asking for a little more. Only applies across units,
    /// where factors and recipes round.
    private static let conversionTolerance = 0.02

    static func plan(ingredients: [Ingredient], stock: [StockLine]) -> CookingPlan {
        struct Remaining { var line: StockLine; var quantity: Double; let original: Double }
        var remaining = stock
            .map { Remaining(line: $0, quantity: $0.quantity, original: $0.quantity) }
            .sorted { ($0.line.expiresOn ?? .distantFuture) < ($1.line.expiresOn ?? .distantFuture) }
        var plan = CookingPlan()
        if ingredients.isEmpty {
            plan.checks.append(.init(name: "Recipe", reason: "This recipe has no ingredients. Add them before tracking inventory automatically."))
        }

        for ingredient in ingredients {
            let note = ingredient.note ?? ""
            let unit = ingredient.unit ?? ""
            if note.range(of: #"\boptional\b|to taste"#, options: [.regularExpression, .caseInsensitive]) != nil
                || Units.find(unit)?.kind == .qualitative
                || unit.range(of: "^(to taste|as needed)$", options: [.regularExpression, .caseInsensitive]) != nil {
                continue
            }
            let wanted = normalizeName(ingredient.pantryName)
            let matchIndexes = remaining.indices.filter { normalizeName(remaining[$0].line.name) == wanted }
            func addMissing(_ quantity: Double?) {
                plan.missingIngredients.append(.init(name: ingredient.name, quantity: quantity, unit: ingredient.unit))
            }
            guard let quantity = ingredient.quantity, quantity.isFinite, quantity > 0 else {
                plan.checks.append(.init(name: ingredient.name, reason: "Recipe amount is unspecified. Check it manually; inventory will not be deducted."))
                if !matchIndexes.contains(where: { remaining[$0].quantity > epsilon }) { addMissing(nil) }
                continue
            }
            var needed = quantity
            let compatible = matchIndexes.filter { Units.convert(1, from: ingredient.unit, to: remaining[$0].line.unit) != nil }
            var drawnFrom: [Int] = []
            for index in compatible {
                if needed <= epsilon { break }
                if remaining[index].quantity > epsilon { drawnFrom.append(index) }
                let wanted = Units.convert(needed, from: ingredient.unit, to: remaining[index].line.unit)!
                if Units.find(ingredient.unit) != Units.find(remaining[index].line.unit),
                   abs(wanted - remaining[index].quantity) <= remaining[index].quantity * conversionTolerance {
                    remaining[index].quantity = 0
                    needed = 0
                    break
                }
                let taken = min(wanted, remaining[index].quantity)
                remaining[index].quantity -= taken
                needed -= Units.convert(taken, from: remaining[index].line.unit, to: ingredient.unit)!
            }
            if needed > epsilon {
                let uncertain = matchIndexes.contains { remaining[$0].quantity > epsilon && Units.convert(1, from: ingredient.unit, to: remaining[$0].line.unit) == nil }
                let rounded = Double(String(format: "%.6g", needed)) ?? needed
                if uncertain {
                    plan.checks.append(.init(name: ingredient.name, reason: "Cannot compare the remaining \(Units.format(rounded)) \(ingredient.unit ?? "units") with the pantry units. Check and adjust that stock manually."))
                } else {
                    addMissing(rounded)
                }
            } else {
                plan.availableCount += 1
                // Stock goes soonest-expiring first, but a batch in units the recipe can't be compared with is skipped.
                // Expiry dates are calendar days, so compare days as the web's YYYY-MM-DD strings do.
                func day(_ date: Date) -> Date { Calendar.current.startOfDay(for: date) }
                let passedOver = matchIndexes.first { index in
                    guard let expires = remaining[index].line.expiresOn, remaining[index].quantity > epsilon, !compatible.contains(index) else { return false }
                    return drawnFrom.contains { other in remaining[other].line.expiresOn.map { day($0) > day(expires) } ?? true }
                }
                if let passedOver, let expires = remaining[passedOver].line.expiresOn {
                    let item = remaining[passedOver]
                    let amount = [Units.format(item.quantity), item.line.unit].filter { !$0.isEmpty }.joined(separator: " ")
                    plan.checks.append(.init(name: ingredient.name, reason: "The \(amount) expiring \(expires.formatted(date: .abbreviated, time: .omitted)) can't be compared with the recipe's \(ingredient.unit ?? "amount"), so later stock is used instead. Use the expiring one if you can and adjust the pantry by hand."))
                }
            }
        }
        plan.deductions = remaining
            .filter { $0.original - $0.quantity > epsilon }
            .map { .init(id: $0.line.id, name: $0.line.name, quantity: $0.original - $0.quantity, unit: $0.line.unit, remaining: $0.quantity) }
        return plan
    }
}
