import Foundation
import Testing
@testable import SousChef

/// Finding the item a purchase refills, and what refilling changes.
@MainActor
struct RefillMatchTests {
    private func stocked(_ name: String, _ quantity: Double = 0, unit: String = "each", brand: String? = nil, barcode: String? = nil,
                         age: TimeInterval = 0) -> RefillMatch.Stocked {
        RefillMatch.Stocked(id: UUID(), name: name, brand: brand, barcode: barcode, quantity: quantity, unit: unit,
                            createdAt: Date(timeIntervalSince1970: 1_000_000 - age))
    }

    // MARK: Matching

    @Test func theSameBarcodeIsAStrongMatch() {
        let milk = stocked("Milk", brand: "Brand A", barcode: "123")
        let match = RefillMatch.best(name: "Something else entirely", brand: "Brand B", barcode: "123", unit: "each", in: [milk, stocked("Eggs")])
        #expect(match == RefillMatch.Result(id: milk.id, confidence: .strong, isOut: true))
        #expect(match?.defaultOn == true && match?.isOffered == true)
    }

    @Test func theSameNameWithoutTheBrandIsAStrongMatch() {
        let milk = stocked("Milk", brand: "Brand A", barcode: "111")
        // Another brand's milk, scanned with the brand in front of or behind the name.
        #expect(RefillMatch.best(name: "Fairlife Milk", brand: "Fairlife", barcode: "222", unit: "each", in: [milk])?.confidence == .strong)
        #expect(RefillMatch.best(name: "Milk Fairlife", brand: "fairlife", barcode: "222", unit: "each", in: [milk])?.id == milk.id)
        // Plurals and capitals don't matter.
        let eggs = stocked("Egg")
        #expect(RefillMatch.best(name: "  EGGS ", unit: "each", in: [eggs]) == RefillMatch.Result(id: eggs.id, confidence: .strong, isOut: true))
        // A brand that is the whole name isn't removed.
        #expect(RefillMatch.foodWords(name: "Nutella", brand: "Nutella") == ["nutella"])
    }

    @Test func qualifiersMakeAWeakMatch() {
        let milk = stocked("Milk")
        let match = RefillMatch.best(name: "Organic Whole Milk", unit: "each", in: [milk])
        #expect(match == RefillMatch.Result(id: milk.id, confidence: .weak, isOut: true))
        // Offered, but the person turns it on.
        #expect(match?.isOffered == true && match?.defaultOn == false)
        // Either way round.
        let whole = stocked("Whole milk 2%")
        #expect(RefillMatch.best(name: "Milk", unit: "each", in: [whole])?.confidence == .weak)
        let cheddar = stocked("Cheddar cheese")
        #expect(RefillMatch.best(name: "Cheese", unit: "each", in: [cheddar])?.confidence == .weak)
    }

    @Test func twoDifferentFoodsThatBothFitGiveNoMatch() {
        let items = [stocked("Oat milk"), stocked("Whole milk")]
        #expect(RefillMatch.best(name: "Milk", unit: "each", in: items) == nil)
        // An exact name still wins among them.
        let both = items + [stocked("Milk")]
        #expect(RefillMatch.best(name: "Milk", unit: "each", in: both)?.id == both[2].id)
    }

    @Test func aDifferentFoodIsNoMatch() {
        #expect(RefillMatch.best(name: "Oat milk", unit: "each", in: [stocked("Milk")]) == nil)
        #expect(RefillMatch.best(name: "Milk", unit: "each", in: [stocked("Oat milk")]) == nil)
        #expect(RefillMatch.best(name: "Peanut butter", unit: "each", in: [stocked("Butter")]) == nil)
        #expect(RefillMatch.best(name: "Chicken broth", unit: "each", in: [stocked("Chicken")]) == nil)
        #expect(RefillMatch.best(name: "Tomato sauce", unit: "each", in: [stocked("Tomato")]) == nil)
        #expect(RefillMatch.best(name: "Bread", unit: "each", in: [stocked("Milk")]) == nil)
        #expect(RefillMatch.best(name: "", unit: "each", in: [stocked("Milk")]) == nil)
    }

    @Test func outItemsComeFirstThenTheNewest() {
        let inStock = stocked("Milk", 2)
        let outOld = stocked("Milk", 0, age: 500)
        let outNew = stocked("Milk", 0, age: 100)
        #expect(RefillMatch.best(name: "Milk", unit: "each", in: [inStock, outOld, outNew])?.id == outNew.id)
        let newerInStock = stocked("Milk", 1, age: -100)
        let match = RefillMatch.best(name: "Milk", unit: "each", in: [inStock, newerInStock])
        #expect(match == RefillMatch.Result(id: newerInStock.id, confidence: .strong, isOut: false))
        // In stock: offered, off until asked for.
        #expect(match?.isOffered == true && match?.defaultOn == false)
        // An out item under another barcode beats the scanned barcode's item in stock.
        let scanned = stocked("Milk", 3, barcode: "999")
        #expect(RefillMatch.best(name: "Milk", barcode: "999", unit: "each", in: [scanned, outOld])?.id == outOld.id)
    }

    @Test func aLooseMatchInStockIsNotOffered() {
        let match = RefillMatch.best(name: "Organic Whole Milk", unit: "each", in: [stocked("Milk", 1)])
        #expect(match?.confidence == .weak && match?.isOffered == false)
        // The out one is preferred when there are both.
        let out = stocked("Milk", 0, age: 900)
        #expect(RefillMatch.best(name: "Organic Whole Milk", unit: "each", in: [stocked("Milk", 1), out])?.id == out.id)
    }

    @Test func anItemInStockInAnotherUnitIsSkipped() {
        let liters = stocked("Milk", 1, unit: "l", barcode: "123")
        #expect(RefillMatch.best(name: "Milk", barcode: "123", unit: "each", in: [liters]) == nil)
        #expect(RefillMatch.best(name: "Milk", barcode: "123", unit: "L", in: [liters])?.id == liters.id)
        // Out, the unit doesn't matter: the purchase brings its own.
        let out = stocked("Milk", 0, unit: "l")
        #expect(RefillMatch.best(name: "Milk", unit: "each", in: [liters, out])?.id == out.id)
    }

    @Test func pantryItemsCompareByTheirCatalogUnit() {
        let item = PantryItem(name: "Milk", quantity: 1, unit: "liters")
        item.brand = "Brand A"
        item.barcode = "123"
        let candidate = item.refillCandidate
        #expect(candidate.unit == "l" && candidate.id == item.uuid && candidate.brand == "Brand A" && candidate.barcode == "123")
    }

    // MARK: Refilling

    private func form(_ quantity: Double = 1, unit: String = "each", location: StorageLocation = .fridge) -> PantryRefill {
        PantryRefill(quantity: quantity, unit: unit, location: location)
    }

    @Test func refillingAnOutItemTakesThePurchase() throws {
        let kitchen = Kitchen(inMemory: true)
        let milk = PantryItem(name: "Milk", location: .pantry, quantity: 0, unit: "l")
        milk.brand = "Brand A"
        milk.barcode = "111"
        milk.category = "Dairy"
        milk.notes = "Top shelf"
        milk.serverID = "inventoryItems_1"
        milk.needsPush = false
        kitchen.context.insert(milk)

        let expiry = Date(timeIntervalSinceNow: 7 * 86_400)
        var purchase = form(2, unit: "each")
        purchase.expiresOn = expiry
        purchase.brand = " Brand B "
        purchase.barcode = "222"
        purchase.category = ""
        purchase.notes = ""
        purchase.facts = FoodFacts(brand: "Brand B")
        var nutrition = Nutrition()
        nutrition.energyKcal = 64
        purchase.nutrition = nutrition
        kitchen.refill(milk, with: purchase)

        #expect(kitchen.fetch(PantryItem.self).count == 1)
        #expect(milk.name == "Milk")
        #expect(milk.quantity == 2 && milk.unit == "each")
        #expect(milk.location == .fridge)
        #expect(milk.expiresOn == expiry)
        #expect(milk.brand == "Brand B" && milk.barcode == "222")
        #expect(milk.foodFacts?.brand == "Brand B")
        #expect(milk.nutrition?.energyKcal == 64)
        // Empty in the form: the item's own are kept.
        #expect(milk.category == "Dairy" && milk.notes == "Top shelf")
        // An ordinary edit as far as syncing goes, with nothing to count.
        #expect(milk.needsPush && milk.serverID == "inventoryItems_1")
        #expect(kitchen.fetch(PantryOutcome.self).isEmpty)
        #expect(kitchen.fetch(Tombstone.self).isEmpty)
    }

    @Test func refillingAnItemInStockAddsToIt() throws {
        let kitchen = Kitchen(inMemory: true)
        let expiry = Date(timeIntervalSinceNow: 2 * 86_400)
        let milk = PantryItem(name: "Milk", location: .pantry, quantity: 1.5, unit: "l")
        milk.brand = "Brand A"
        milk.barcode = "111"
        milk.expiresOn = expiry
        milk.needsPush = false
        let eggs = PantryItem(name: "Eggs", location: .fridge, quantity: 6, unit: "each")
        kitchen.context.insert(milk)
        kitchen.context.insert(eggs)

        var purchase = form(0.25, unit: "l")
        purchase.expiresOn = Date(timeIntervalSinceNow: 9 * 86_400)
        purchase.brand = "Brand B"
        purchase.barcode = "222"
        purchase.category = "Dairy"
        kitchen.refill(milk, with: purchase)
        #expect(milk.quantity == 1.75 && milk.unit == "l")
        #expect(milk.expiresOn == expiry)
        #expect(milk.brand == "Brand A" && milk.barcode == "111")
        #expect(milk.category == "Dairy")
        // A suggested place doesn't move stock that's already somewhere; the user's own pick does.
        #expect(milk.location == .pantry)
        #expect(milk.needsPush)
        var moved = form(0, unit: "l", location: .freezer)
        moved.locationChosen = true
        kitchen.refill(milk, with: moved)
        #expect(milk.location == .freezer && milk.quantity == 1.75)

        // What it lacks, it takes from the purchase.
        var more = form(6)
        more.expiresOn = expiry
        more.brand = "Happy Hens"
        more.barcode = "333"
        kitchen.refill(eggs, with: more)
        #expect(eggs.quantity == 12)
        #expect(eggs.expiresOn == expiry && eggs.brand == "Happy Hens" && eggs.barcode == "333")
        #expect(kitchen.fetch(PantryItem.self).count == 2)
    }

    @Test func puttingPurchasesAwayFillsThePlaceholderForTheSameFood() {
        let kitchen = Kitchen(inMemory: true)
        let eggs = PantryItem(name: "Egg", quantity: 0, unit: "each")
        let oatMilk = PantryItem(name: "Oat milk", quantity: 0, unit: "each")
        let rice = PantryItem(name: "Rice", quantity: 0, unit: "kg")
        for item in [eggs, oatMilk, rice] { kitchen.context.insert(item) }
        let boughtEggs = ShoppingItem(name: "Eggs", quantity: 12, unit: "each")
        let boughtMilk = ShoppingItem(name: "Milk", quantity: 1, unit: "each")
        let boughtRice = ShoppingItem(name: "Rice", quantity: 1, unit: "lb")
        for item in [boughtEggs, boughtMilk, boughtRice] { kitchen.context.insert(item) }
        kitchen.stock([
            Kitchen.Purchase(item: boughtEggs, quantity: 12, unit: "each", location: .fridge, expiresOn: nil),
            Kitchen.Purchase(item: boughtMilk, quantity: 1, unit: "each", location: .fridge, expiresOn: nil),
            Kitchen.Purchase(item: boughtRice, quantity: 1, unit: "lb", location: .pantry, expiresOn: nil),
        ])
        // Eggs fill "Egg"; milk isn't oat milk; rice in another unit is a new batch.
        #expect(eggs.quantity == 12 && eggs.location == .fridge && eggs.name == "Egg")
        #expect(oatMilk.quantity == 0)
        #expect(rice.quantity == 0)
        #expect(Set(kitchen.fetch(PantryItem.self).map(\.name)) == ["Egg", "Oat milk", "Rice", "Milk"])
        #expect(kitchen.fetch(PantryItem.self).count == 5)
    }
}
