import Foundation
import Testing
@testable import SousChef

/// The widget snapshot's "Tonight's meal" section.
@MainActor
struct TonightSnapshotTests {
    /// 18:00 today, so dinner is the meal that counts.
    private let evening = Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: .now)!

    private func recipe(_ kitchen: Kitchen, _ title: String, servings: Int?, _ ingredients: [(String, Double, String)]) -> Recipe {
        var draft = RecipeDraft(title: title)
        draft.servings = servings
        draft.ingredients = ingredients.map { Ingredient(name: $0.0, quantity: $0.1, unit: $0.2) }
        return kitchen.save(draft)
    }

    private func day(_ offset: Int) -> String {
        MealPlanner.day(Calendar.current.date(byAdding: .day, value: offset, to: evening)!)
    }

    @Test func tonightShowsTheMealWithReadinessAtItsPlannedServings() throws {
        let kitchen = Kitchen(inMemory: true)
        kitchen.context.insert(PantryItem(name: "Rice", quantity: 300, unit: "g"))
        kitchen.context.insert(PantryItem(name: "Stock", quantity: 1, unit: "l"))
        let risotto = recipe(kitchen, "Risotto", servings: 2, [("Rice", 200, "g"), ("Stock", 1, "l"), ("Parmesan", 50, "g")])
        let meal = kitchen.plan(risotto, on: day(0), slot: .dinner, servings: 2)

        let tonight = try #require(WidgetSnapshotWriter.snapshot(of: kitchen, now: evening).tonight)
        #expect(tonight.id == meal.uuid)
        #expect(tonight.recipeID == risotto.uuid)
        #expect(tonight.recipeName == "Risotto")
        #expect(tonight.day == day(0))
        #expect(tonight.slot == "dinner")
        #expect(tonight.slotTitle == "Dinner")
        #expect(tonight.servings == 2)
        #expect(tonight.missing == 1)
        #expect(tonight.readiness == "Missing 1")
        #expect(tonight.photo == nil)

        // Doubling the servings doubles the rice and stock too.
        meal.servings = 4
        let doubled = try #require(WidgetSnapshotWriter.snapshot(of: kitchen, now: evening).tonight)
        #expect(doubled.missing == 3)
        #expect(doubled.readiness == "Missing 3")
    }

    @Test func aStockedMealIsReady() throws {
        let kitchen = Kitchen(inMemory: true)
        kitchen.context.insert(PantryItem(name: "Eggs", quantity: 6))
        let omelette = recipe(kitchen, "Omelette", servings: 1, [("Eggs", 2, "each")])
        kitchen.plan(omelette, on: day(0), slot: .dinner)
        let tonight = try #require(WidgetSnapshotWriter.snapshot(of: kitchen, now: evening).tonight)
        #expect(tonight.readiness == "Ready")
    }

    @Test func nothingPlannedTodayMeansNoTonight() {
        let kitchen = Kitchen(inMemory: true)
        let soup = recipe(kitchen, "Soup", servings: 2, [("Stock", 1, "l")])
        kitchen.plan(soup, on: day(-1))
        kitchen.plan(soup, on: day(2))

        let snapshot = WidgetSnapshotWriter.snapshot(of: kitchen, now: evening)
        #expect(snapshot.tonight == nil)
        #expect(snapshot.tomorrow == nil)
        #expect(snapshot.meal(at: evening) == nil)
    }

    @Test func cookedMealsAreLeftOut() throws {
        let kitchen = Kitchen(inMemory: true)
        let soup = recipe(kitchen, "Soup", servings: 2, [("Stock", 1, "l")])
        let salad = recipe(kitchen, "Salad", servings: 2, [("Lettuce", 1, "each")])
        let dinner = kitchen.plan(soup, on: day(0), slot: .dinner)
        kitchen.plan(salad, on: day(0), slot: .lunch)
        kitchen.setCooked(dinner, true)

        // With dinner cooked, tonight falls back to today's other uncooked meal.
        let tonight = try #require(WidgetSnapshotWriter.snapshot(of: kitchen, now: evening).tonight)
        #expect(tonight.recipeName == "Salad")
        #expect(tonight.slot == "lunch")

        kitchen.setCooked(try #require(kitchen.tonightsMeal(now: evening)), true)
        #expect(WidgetSnapshotWriter.snapshot(of: kitchen, now: evening).tonight == nil)
    }

    @Test func theWidgetMovesOnToTomorrowsMealAtMidnight() throws {
        let kitchen = Kitchen(inMemory: true)
        let soup = recipe(kitchen, "Soup", servings: 2, [("Stock", 1, "l")])
        let pasta = recipe(kitchen, "Pasta", servings: 2, [("Pasta", 200, "g")])
        kitchen.plan(soup, on: day(0))
        kitchen.plan(pasta, on: day(1))

        let snapshot = WidgetSnapshotWriter.snapshot(of: kitchen, now: evening)
        #expect(snapshot.tonight?.recipeName == "Soup")
        #expect(snapshot.tomorrow?.recipeName == "Pasta")

        let midnight = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: evening))!
        let dayAfter = Calendar.current.date(byAdding: .day, value: 2, to: midnight)!
        #expect(snapshot.meal(at: evening)?.recipeName == "Soup")
        #expect(snapshot.meal(at: midnight)?.recipeName == "Pasta")
        #expect(snapshot.meal(at: dayAfter) == nil)
    }

    @Test func tonightRoundTripsAndOldSnapshotsStillDecode() throws {
        let meal = KitchenSnapshot.Meal(id: UUID(), recipeID: UUID(), recipeName: "Soup", day: "2026-09-30",
                                        slot: "dinner", servings: 4, missing: 2, photo: "meal-abc.jpg")
        let snapshot = KitchenSnapshot(expiringWindowDays: 3, tonight: meal)
        #expect(try KitchenSnapshot.decode(snapshot.encoded()) == snapshot)

        // Written by the widget branch before meal planning existed.
        let old = #"{"expiring":[{"expiresOn":"2026-09-21T12:00:00Z","id":"7F9D2C1A-4B3E-4F5A-9C8D-1E2F3A4B5C6D","location":"fridge","name":"Spinach"}],"shopping":{"names":["Milk"],"openCount":1}}"#
        let decoded = try KitchenSnapshot.decode(Data(old.utf8))
        #expect(decoded.expiring.map(\.name) == ["Spinach"])
        #expect(decoded.shopping.openCount == 1)
        #expect(decoded.tonight == nil)
        #expect(decoded.tomorrow == nil)
        #expect(decoded.expiringWindowDays == nil)
    }

    @Test func photoNamesFollowThePhotosContents() {
        let one = WidgetSnapshotWriter.photoName(for: Data([1, 2, 3]))
        #expect(one == WidgetSnapshotWriter.photoName(for: Data([1, 2, 3])))
        #expect(one != WidgetSnapshotWriter.photoName(for: Data([1, 2, 4])))
        #expect(one.hasPrefix("meal-") && one.hasSuffix(".jpg"))
    }
}
