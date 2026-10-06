import Foundation
import Testing
@testable import SousChef

/// "Expiring soon", the Cook tab's "Use it up" ranking, and reminder content.
@MainActor
struct ExpiryRemindersTests {
    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/London")!
        return calendar
    }()

    /// 10 March 2026, 07:00 in London.
    private var now: Date { calendar.date(from: DateComponents(year: 2026, month: 3, day: 10, hour: 7))! }

    private func day(_ offset: Int) -> Date { calendar.date(byAdding: .day, value: offset, to: now)! }

    private func stock(_ name: String, _ offset: Int?, quantity: Double = 1) -> ExpiringFood.Stock {
        ExpiringFood.Stock(id: UUID(), name: name, quantity: quantity, expiresOn: offset.map(day))
    }

    @Test func findsInStockItemsInsideTheWindowIncludingExpired() {
        let items = [stock("Milk", 2), stock("Spinach", 2), stock("Yogurt", -2), stock("Eggs", 10), stock("Cream", 0, quantity: 0), stock("Rice", nil)]
        let found = ExpiringFood.find(in: items, within: 3, now: now, calendar: calendar)
        #expect(found.map(\.name) == ["Yogurt", "Milk", "Spinach"])
        #expect(found.map(\.daysLeft) == [-2, 2, 2])
        #expect(ExpiringFood.find(in: items, within: 1, now: now, calendar: calendar).map(\.name) == ["Yogurt"])
    }

    @Test func remindersStopTheDayAfterSomethingExpired() {
        let items = [stock("Milk", 0), stock("Yogurt", -1), stock("Cream", -2)]
        #expect(ExpiringFood.reminderItems(in: items, within: 3, now: now, calendar: calendar).map(\.name) == ["Yogurt", "Milk"])
        // "Use soon" still lists everything in stock, so it can be marked used or thrown away.
        #expect(ExpiringFood.find(in: items, within: 3, now: now, calendar: calendar).map(\.name) == ["Cream", "Yogurt", "Milk"])
    }

    @Test func summarizesInPlainLanguage() {
        func food(_ name: String, _ days: Int) -> ExpiringFood { ExpiringFood(id: UUID(), name: name, expiresOn: now, daysLeft: days) }
        #expect(ExpiringFood.summary([food("Milk", 2), food("spinach", 2)]) == "Milk and spinach expire in 2 days")
        #expect(ExpiringFood.summary([food("milk", 0)]) == "Milk expires today")
        #expect(ExpiringFood.summary([food("Spinach", 2), food("Yogurt", -1), food("Milk", 1), food("Eggs", 3)])
                == "Yogurt expired yesterday; Milk expires tomorrow; Spinach expires in 2 days (+1 more)")
        #expect(ExpiryReminderSchedule.content(for: []) == nil)
        let single = ExpiryReminderSchedule.content(for: [food("Milk", 1)])
        #expect(single?.title == "Use it up")
        #expect(single?.body == "Milk expires tomorrow.")
        #expect(ExpiryReminderSchedule.content(for: [food("Milk", 2), food("Spinach", 2)])?.title == "Use up 2 items")
    }

    @Test func schedulesOneReminderPerDayOnlyWhenSomethingExpires() {
        // Milk expires in 2 days; eggs in 9. Reminders at 09:00 with a 3-day window.
        let schedule = ExpiryReminderSchedule(stock: [stock("Milk", 2), stock("Eggs", 9)], window: 3, hour: 9, minute: 0,
                                              now: now, days: 14, calendar: calendar)
        let days = schedule.reminders.map { calendar.component(.day, from: $0.fireDate) }
        // Milk: 10–13 March, the last saying it expired yesterday, then it stops
        // even though it's still in stock. Eggs likewise: 16–20 March.
        #expect(days == [10, 11, 12, 13, 16, 17, 18, 19, 20])
        #expect(schedule.reminders[0].id == "expiry-reminder-2026-03-10")
        #expect(schedule.reminders[0].body == "Milk expires in 2 days.")
        #expect(schedule.reminders[3].body == "Milk expired yesterday.")
        #expect(schedule.reminders[4].body == "Eggs expires in 3 days.")
        #expect(calendar.component(.hour, from: schedule.reminders[0].fireDate) == 9)

        // Nothing dated: nothing scheduled. A time already past today starts tomorrow.
        #expect(ExpiryReminderSchedule(stock: [stock("Rice", nil)], window: 3, hour: 9, minute: 0, now: now, calendar: calendar).reminders.isEmpty)
        let late = ExpiryReminderSchedule(stock: [stock("Milk", 2)], window: 3, hour: 6, minute: 30, now: now, days: 3, calendar: calendar)
        #expect(late.reminders.map { calendar.component(.day, from: $0.fireDate) } == [11, 12])
    }

    @Test func ranksRecipesByExpiringFoodUsedThenReadiness() {
        let kitchen = Kitchen(inMemory: true)
        func item(_ name: String, _ quantity: Double, _ unit: String, expiresInDays: Int? = nil) {
            let item = PantryItem(name: name, quantity: quantity, unit: unit)
            item.expiresOn = expiresInDays.map { Calendar.current.date(byAdding: .day, value: $0, to: Date())! }
            kitchen.context.insert(item)
        }
        func recipe(_ title: String, _ ingredients: [(String, Double, String)]) {
            var draft = RecipeDraft(title: title)
            draft.ingredients = ingredients.map { Ingredient(name: $0.0, quantity: $0.1, unit: $0.2) }
            _ = kitchen.save(draft)
        }
        item("Pasta", 500, "g")
        item("Spinach", 200, "g", expiresInDays: 1)
        item("Milk", 1, "l", expiresInDays: 2)
        recipe("Plain pasta", [("Pasta", 100, "g")])
        recipe("Spinach pasta", [("Pasta", 100, "g"), ("Spinach", 100, "g")])
        recipe("Creamed spinach", [("Spinach", 100, "g"), ("Milk", 0.2, "l")])
        recipe("Spinach soup", [("Spinach", 100, "g"), ("Stock", 1, "l")])
        recipe("Milk pudding", [("Milk", 0.5, "l")])

        let ranked = Kitchen.rankRecipes(kitchen.fetch(Recipe.self), pantry: kitchen.fetch(PantryItem.self), within: 3)
        let usingUp = Kitchen.rankForUsingUp(ranked)
        // Two expiring items first; then spinach (sooner) before milk; ready before missing.
        #expect(usingUp.map(\.recipe.title) == ["Creamed spinach", "Spinach pasta", "Spinach soup", "Milk pudding"])
        #expect(usingUp[0].expiringItems.map(\.name) == ["Spinach", "Milk"])
        #expect(Kitchen.rankForUsingUp(Kitchen.rankRecipes(kitchen.fetch(Recipe.self), pantry: kitchen.fetch(PantryItem.self), within: 1))
            .map(\.recipe.title) == ["Creamed spinach", "Spinach pasta", "Spinach soup"])
    }
}
