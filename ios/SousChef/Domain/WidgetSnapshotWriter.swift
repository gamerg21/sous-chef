import CryptoKit
import Foundation
import UIKit
import WidgetKit

/// Keeps the widgets' `KitchenSnapshot` current. `Kitchen.changed()` asks for
/// a refresh after every edit (pantry, shopping list and meal plan alike), and
/// the app refreshes when it becomes active, after a server sync, and when it
/// goes to the background. Timelines reload only when the snapshot actually
/// changed, so frequent edits don't use up WidgetKit's reload budget.
enum WidgetSnapshotWriter {
    private static var pending: Task<Void, Never>?

    /// Writes a fresh snapshot shortly, coalescing bursts of edits.
    static func scheduleRefresh(_ kitchen: Kitchen = .shared) {
        pending?.cancel()
        pending = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            refresh(kitchen)
        }
    }

    /// Writes the snapshot now, such as when the app is about to be suspended.
    static func refresh(_ kitchen: Kitchen = .shared) {
        pending?.cancel()
        pending = nil
        let snapshot = snapshot(of: kitchen)
        guard let url = KitchenSnapshot.fileURL, let data = try? snapshot.encoded() else { return }
        writePhotos(for: snapshot, from: kitchen)
        if (try? Data(contentsOf: url)) == data { return }
        do {
            try data.write(to: url, options: .atomic)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            // Widgets keep showing the last snapshot.
        }
    }

    /// The widgets' picture of the kitchen at `now`. Expiring food uses the
    /// same rules and window as the Pantry's "Use soon" section and reminders.
    static func snapshot(of kitchen: Kitchen, now: Date = .now, window: Int = ExpiringFood.windowDays) -> KitchenSnapshot {
        let onHand = kitchen.onHand()
        let byID = Dictionary(onHand.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        let expiring = ExpiringFood.find(in: onHand.map(\.expiringStock), within: window, now: now)
            .prefix(KitchenSnapshot.expiringLimit)
            .compactMap { food -> KitchenSnapshot.ExpiringItem? in
                guard let item = byID[food.id] else { return nil }
                return .init(id: food.id, name: food.name, location: item.location.rawValue, expiresOn: food.expiresOn)
            }

        let open = kitchen.openShoppingItems()
        let shopping = KitchenSnapshot.ShoppingSummary(openCount: open.count,
                                                       names: open.prefix(KitchenSnapshot.shoppingNameLimit).map(\.name))

        let calendar = Calendar.current
        let tomorrowStart = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
        let tomorrowsMeal = MealPlanner.tonight(in: kitchen.plannedMeals(from: MealPlanner.day(tomorrowStart), days: 1), now: tomorrowStart)

        return KitchenSnapshot(expiring: expiring,
                               shopping: shopping,
                               expiringWindowDays: window,
                               tonight: meal(kitchen.tonightsMeal(now: now), in: kitchen),
                               tomorrow: meal(tomorrowsMeal, in: kitchen))
    }

    /// A planned meal as the widgets show it, with readiness at its planned servings.
    static func meal(_ meal: PlannedMeal?, in kitchen: Kitchen) -> KitchenSnapshot.Meal? {
        guard let meal, let recipe = kitchen.recipe(for: meal) else { return nil }
        let plan = kitchen.plan(for: recipe, scale: kitchen.scale(for: meal))
        return KitchenSnapshot.Meal(id: meal.uuid,
                                    recipeID: recipe.uuid,
                                    recipeName: recipe.title,
                                    day: meal.day,
                                    slot: meal.slot.rawValue,
                                    servings: meal.servings,
                                    missing: plan.missingIngredients.count,
                                    photo: recipe.photo.map(photoName(for:)))
    }

    // MARK: Photos

    /// Names a thumbnail after the photo's contents, so an unchanged photo
    /// is written once and a changed one gets a new file.
    static func photoName(for data: Data) -> String {
        let digest = SHA256.hash(data: data).prefix(8).map { String(format: "%02x", $0) }.joined()
        return "meal-\(digest).jpg"
    }

    /// The side of a thumbnail's shorter edge, in pixels: enough for the
    /// widgets' largest photo at 3x.
    private static let thumbnailPixels: CGFloat = 180

    /// Writes small JPEGs for the snapshot's meal photos and removes old ones.
    private static func writePhotos(for snapshot: KitchenSnapshot, from kitchen: Kitchen) {
        guard let directory = KitchenSnapshot.photoDirectory else { return }
        let meals = [snapshot.tonight, snapshot.tomorrow].compactMap(\.self)
        let wanted = Set(meals.compactMap(\.photo))
        let files = Set((try? FileManager.default.contentsOfDirectory(atPath: directory.path())) ?? [])
        for stale in files.subtracting(wanted) {
            try? FileManager.default.removeItem(at: directory.appending(path: stale))
        }
        guard !wanted.isSubset(of: files) else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let recipes = Dictionary(kitchen.fetch(Recipe.self).map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        for meal in meals {
            guard let name = meal.photo, !files.contains(name),
                  let id = meal.recipeID, let data = recipes[id]?.photo,
                  let jpeg = thumbnail(of: data) else { continue }
            try? jpeg.write(to: directory.appending(path: name), options: .atomic)
        }
    }

    private static func thumbnail(of data: Data) -> Data? {
        guard let image = UIImage(data: data), image.size.width > 0, image.size.height > 0 else { return nil }
        let scale = min(1, thumbnailPixels / min(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format)
            .image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
            .jpegData(compressionQuality: 0.7)
    }
}
