import Foundation
import Testing
@testable import SousChef

/// Used versus thrown away: the run-out rule, the past-date answer, cooking and the tally.
@MainActor
struct PantryOutcomeTests {
    private func item(_ kitchen: Kitchen, _ name: String, _ quantity: Double = 1, expiresInDays: Int? = nil) -> PantryItem {
        let item = PantryItem(name: name, quantity: quantity)
        item.expiresOn = expiresInDays.map { Calendar.current.date(byAdding: .day, value: $0, to: Date())! }
        kitchen.context.insert(item)
        return item
    }

    private func outcomes(_ kitchen: Kitchen) -> [(String, PantryOutcome.Kind)] {
        kitchen.fetch(PantryOutcome.self).sorted { $0.createdAt < $1.createdAt }.map { ($0.name, $0.outcome) }
    }

    @Test func ruleCountsDatedFoodAndAsksOnceItIsPastItsDate() {
        let now = Date()
        func day(_ offset: Int) -> Date { Calendar.current.date(byAdding: .day, value: offset, to: now)! }
        #expect(PantryOutcome.whenEmptied(expiresOn: nil, now: now) == .notCounted)
        #expect(PantryOutcome.whenEmptied(expiresOn: day(3), now: now) == .used)
        #expect(PantryOutcome.whenEmptied(expiresOn: day(0), now: now) == .used)
        #expect(PantryOutcome.whenEmptied(expiresOn: day(-1), now: now) == .ask)
    }

    @Test func usingUpFoodBeforeItsDateCountsAsUsedAndKeepsItOut() {
        let kitchen = Kitchen(inMemory: true)
        let milk = item(kitchen, "Milk", 1, expiresInDays: 2)
        let rice = item(kitchen, "Rice", 1)
        #expect(kitchen.adjust(milk, by: -1))
        #expect(kitchen.adjust(rice, by: -1))
        #expect(milk.quantity == 0)
        #expect(kitchen.fetch(PantryItem.self).count == 2)
        #expect(outcomes(kitchen).map(\.0) == ["Milk"])
        #expect(outcomes(kitchen).map(\.1) == [.used])
        // Already out: using it again changes nothing and isn't counted twice.
        #expect(kitchen.adjust(milk, by: -1))
        #expect(kitchen.fetch(PantryOutcome.self).count == 1)
    }

    @Test func runningOutOfExpiredFoodAsksAndSettlingKeepsItOut() {
        let kitchen = Kitchen(inMemory: true)
        let yogurt = item(kitchen, "Yogurt", 2, expiresInDays: -1)
        #expect(kitchen.adjust(yogurt, by: -1))
        #expect(yogurt.quantity == 1)
        // The last one needs an answer; nothing changes until it's given.
        #expect(!kitchen.adjust(yogurt, by: -1))
        #expect(yogurt.quantity == 1)
        #expect(kitchen.fetch(PantryOutcome.self).isEmpty)
        kitchen.settle(yogurt, as: .wasted)
        #expect(yogurt.quantity == 0)
        #expect(kitchen.fetch(PantryItem.self).count == 1)
        #expect(outcomes(kitchen).map(\.1) == [.wasted])
        kitchen.settle(yogurt, as: .used)
        #expect(kitchen.fetch(PantryOutcome.self).count == 1)
        let tally = kitchen.outcomeTally()
        #expect(tally.used == 0 && tally.wasted == 1)
    }

    @Test func cookingADatedItemToTheLastCrumbCountsAsUsed() async {
        let kitchen = Kitchen(inMemory: true)
        _ = item(kitchen, "Eggs", 2, expiresInDays: 4)
        _ = item(kitchen, "Salt", 1)
        var draft = RecipeDraft(title: "Eggs")
        draft.ingredients = [Ingredient(name: "Eggs", quantity: 2, unit: "each"), Ingredient(name: "Salt", quantity: 1, unit: "each")]
        let recipe = kitchen.save(draft)
        let result = await kitchen.cook(recipe, addMissing: false)
        #expect(!result.onServer)
        #expect(outcomes(kitchen).map(\.0) == ["Eggs"])
        #expect(outcomes(kitchen).map(\.1) == [.used])
    }

    @Test func ranOutBySiriCountsFoodBeforeItsDateOnly() {
        let kitchen = Kitchen(inMemory: true)
        _ = item(kitchen, "Milk", 1, expiresInDays: 1)
        _ = item(kitchen, "Cream", 1, expiresInDays: -3)
        _ = kitchen.ranOut(of: "Milk")
        _ = kitchen.ranOut(of: "Cream")
        #expect(outcomes(kitchen).map(\.0) == ["Milk"])
    }

    @Test func tallyCountsThisMonthOnceEach() {
        func outcome(_ kind: PantryOutcome.Kind, _ on: String, serverID: String? = nil, uuid: UUID = UUID()) -> PantryOutcome {
            let value = PantryOutcome(name: "Milk", outcome: kind, on: on)
            value.uuid = uuid
            value.serverID = serverID
            return value
        }
        let shared = UUID()
        let list = [
            outcome(.used, "2026-03-02"),
            outcome(.wasted, "2026-03-09", uuid: shared),
            outcome(.wasted, "2026-03-09", serverID: "s1", uuid: shared), // iCloud copy and server copy of one outcome
            outcome(.used, "2026-03-10", serverID: "s2"),
            outcome(.used, "2026-03-10", serverID: "s2"), // pulled on two devices
            outcome(.used, "2026-02-27"),
        ]
        let tally = PantryOutcome.tally(list, month: "2026-03")
        #expect(tally.used == 2)
        #expect(tally.wasted == 1)
    }
}
