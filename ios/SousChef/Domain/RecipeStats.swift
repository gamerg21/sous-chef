import Foundation

/// The numbers behind the recipe library's at-a-glance pane, each of which
/// also filters the library.
struct RecipeStats {
    /// How far back "popular" looks.
    enum Period: String, CaseIterable, Identifiable {
        case week, month

        var id: String { rawValue }
        var days: Int { self == .week ? 7 : 30 }
        var title: String { self == .week ? "This week" : "This month" }
    }

    /// Recipes added within this many days count as new.
    static let newDays = 30
    /// Recipes that take at most this long count as quick.
    static let quickMinutes = 20

    var ready: Set<UUID> = []
    /// One or two ingredients short.
    var almost: Set<UUID> = []
    var expiring: Set<UUID> = []
    var quick: Set<UUID> = []
    /// Newest first.
    var recent: [UUID] = []
    /// Most cooked and planned first, with how many times.
    var popular: [(id: UUID, count: Int)] = []
    /// Most used first.
    var tags: [(tag: String, count: Int)] = []

    struct Entry {
        var id: UUID
        var createdAt: Date
        var lastCookedAt: Date?
        var minutes: Int?
        var tags: [String]
        /// Nil for a recipe without ingredients.
        var missing: Int?
        var usesExpiring: Bool
    }

    /// `meals` are the days ("YYYY-MM-DD") each recipe was planned or cooked.
    static func compute(_ entries: [Entry], meals: [(recipe: UUID, day: String)], period: Period, now: Date = .now, calendar: Calendar = .current) -> RecipeStats {
        var stats = RecipeStats()
        for entry in entries {
            if entry.missing == 0 { stats.ready.insert(entry.id) }
            if let missing = entry.missing, (1...2).contains(missing) { stats.almost.insert(entry.id) }
            if entry.usesExpiring { stats.expiring.insert(entry.id) }
            if let minutes = entry.minutes, minutes <= quickMinutes { stats.quick.insert(entry.id) }
        }

        let newSince = calendar.date(byAdding: .day, value: -newDays, to: now) ?? now
        stats.recent = entries.filter { $0.createdAt >= newSince }.sorted { $0.createdAt > $1.createdAt }.map(\.id)

        // A meal counts from the start of the period through the end of the
        // week ahead, so this week's plan shows what's popular now; a recipe
        // cooked without a plan counts once more.
        let today = MealPlanner.day(now)
        let from = MealPlanner.day(today, adding: -period.days, calendar: calendar)
        let through = MealPlanner.day(today, adding: 7, calendar: calendar)
        let since = calendar.date(byAdding: .day, value: -period.days, to: now) ?? now
        var counts: [UUID: Int] = [:]
        let known = Set(entries.map(\.id))
        for meal in meals where known.contains(meal.recipe) && meal.day >= from && meal.day < through {
            counts[meal.recipe, default: 0] += 1
        }
        let mealDays = Set(meals.map { "\($0.recipe)|\($0.day)" })
        for entry in entries {
            guard let cooked = entry.lastCookedAt, cooked >= since, !mealDays.contains("\(entry.id)|\(MealPlanner.day(cooked))") else { continue }
            counts[entry.id, default: 0] += 1
        }
        let created = Dictionary(entries.map { ($0.id, $0.createdAt) }, uniquingKeysWith: { first, _ in first })
        stats.popular = counts.map { (id: $0.key, count: $0.value) }
            .sorted { ($0.count, created[$0.id] ?? .distantPast) > ($1.count, created[$1.id] ?? .distantPast) }

        var tagCounts: [String: Int] = [:]
        for entry in entries {
            for tag in Set(entry.tags) { tagCounts[tag, default: 0] += 1 }
        }
        stats.tags = tagCounts.map { (tag: $0.key, count: $0.value) }.sorted { ($0.count, $1.tag) > ($1.count, $0.tag) }
        return stats
    }
}
