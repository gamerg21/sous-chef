import Foundation
import SwiftData

nonisolated enum MealSlot: String, CaseIterable, Identifiable, Codable {
    case breakfast, lunch, dinner, snack

    var id: String { rawValue }
    var title: String {
        switch self {
        case .breakfast: "Breakfast"
        case .lunch: "Lunch"
        case .dinner: "Dinner"
        case .snack: "Snack"
        }
    }
    var symbol: String {
        switch self {
        case .breakfast: "sunrise"
        case .lunch: "sun.max"
        case .dinner: "moon.stars"
        case .snack: "carrot"
        }
    }
    /// Breakfast first, as on the web plan.
    var order: Int { Self.allCases.firstIndex(of: self) ?? 0 }
}

/// A recipe planned for a day and meal. Like `ShoppingItem`, it points at its
/// recipe by UUID (and server ID) rather than a relationship, so it follows
/// CloudKit's rules and survives the recipe being re-created by a sync.
@Model
final class PlannedMeal {
    var uuid: UUID = UUID()
    /// Calendar day as "YYYY-MM-DD" in the person's time zone, the same key the
    /// server uses, so a meal stays on its day across devices and time zones.
    var day: String = ""
    var slotRaw: String = MealSlot.dinner.rawValue
    var recipeUUID: UUID?
    var recipeServerID: String?
    /// Servings to cook; recipe amounts scale by servings / recipe.servings.
    var servings: Int?
    var note: String?
    var cookedAt: Date?
    var createdAt: Date = Date()
    var updatedAt: Date = Date()
    var serverID: String?
    var needsPush: Bool = true

    init(day: String, slot: MealSlot = .dinner) {
        self.day = day
        self.slotRaw = slot.rawValue
    }

    convenience init(recipe: Recipe, day: String, slot: MealSlot = .dinner, servings: Int? = nil) {
        self.init(day: day, slot: slot)
        self.recipeUUID = recipe.uuid
        self.recipeServerID = recipe.serverID
        self.servings = servings ?? recipe.servings
    }

    var slot: MealSlot {
        get { MealSlot(rawValue: slotRaw) ?? .dinner }
        set { slotRaw = newValue.rawValue }
    }

    var isCooked: Bool { cookedAt != nil }

    func touch() {
        updatedAt = Date()
        needsPush = true
    }
}
