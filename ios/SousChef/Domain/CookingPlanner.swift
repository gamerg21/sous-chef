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
            for index in matchIndexes where Units.convert(1, from: ingredient.unit, to: remaining[index].line.unit) != nil {
                if needed <= epsilon { break }
                let available = remaining[index].quantity
                let used = min(Units.convert(needed, from: ingredient.unit, to: remaining[index].line.unit)!, available)
                remaining[index].quantity -= used
                needed -= Units.convert(used, from: remaining[index].line.unit, to: ingredient.unit)!
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
            }
        }
        plan.deductions = remaining
            .filter { $0.original - $0.quantity > epsilon }
            .map { .init(id: $0.line.id, name: $0.line.name, quantity: $0.original - $0.quantity, unit: $0.line.unit, remaining: $0.quantity) }
        return plan
    }
}
