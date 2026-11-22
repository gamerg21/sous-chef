import Foundation

/// What the add form holds when its purchase refills an existing item.
nonisolated struct PantryRefill {
    var quantity: Double
    var unit: String
    var location: StorageLocation
    /// The user picked the location in the form, rather than it being suggested.
    var locationChosen = false
    var expiresOn: Date?
    var brand: String?
    var category: String?
    var notes: String?
    var barcode: String?
    var facts: FoodFacts?
    var nutrition: Nutrition?
}

extension Kitchen {
    /// Puts a purchase into an item the kitchen already has instead of adding
    /// another. The item keeps its name, the household's word for it.
    ///
    /// An item that's out takes the purchase's amount, unit and details. An
    /// item in stock gains the amount (the units must already agree, which
    /// `RefillMatch` checks) and keeps its own date, brand and barcode,
    /// taking the purchase's only where it has none, and stays where it is
    /// unless the user picked a place. Either way it's an
    /// ordinary edit to sync: the server receives the change in amount.
    func refill(_ item: PantryItem, with purchase: PantryRefill) {
        let amount = max(0, purchase.quantity)
        let brand = purchase.brand?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        let nutrition = purchase.nutrition.flatMap { $0.isEmpty ? nil : $0 }
        if item.quantity <= 0 {
            item.setQuantity(amount)
            item.unit = purchase.unit
            item.expiresOn = amount > 0 ? purchase.expiresOn : nil
            item.brand = brand ?? item.brand
            item.barcode = purchase.barcode?.nilIfEmpty ?? item.barcode
            item.foodFacts = purchase.facts ?? item.foodFacts
            item.notes = purchase.notes?.nilIfEmpty ?? item.notes
            item.category = purchase.category?.nilIfEmpty ?? item.category
            item.nutrition = nutrition ?? item.nutrition
            item.location = purchase.location
        } else {
            item.setQuantity(((item.quantity + amount) * 1000).rounded() / 1000)
            item.expiresOn = item.expiresOn ?? purchase.expiresOn
            item.brand = item.brand?.nilIfEmpty ?? brand
            item.barcode = item.barcode?.nilIfEmpty ?? purchase.barcode?.nilIfEmpty
            item.foodFacts = item.foodFacts ?? purchase.facts
            item.notes = item.notes?.nilIfEmpty ?? purchase.notes?.nilIfEmpty
            item.category = item.category?.nilIfEmpty ?? purchase.category?.nilIfEmpty
            item.nutrition = item.nutrition ?? nutrition
            // Stock that's already somewhere stays there unless the user said otherwise.
            if purchase.locationChosen { item.location = purchase.location }
        }
        item.touch()
        changed()
    }
}
