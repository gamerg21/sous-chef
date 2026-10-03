import AppIntents
import CoreSpotlight
import CoreTransferable
import Foundation

// The kitchen's nouns for Siri, Shortcuts and Spotlight. Entities are value
// snapshots; queries read the shared kitchen on the main actor.

struct RecipeEntity: IndexedEntity {
    static let activityType = "com.georgevina.souschef.recipe"
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Recipe", numericFormat: "\(placeholder: .int) recipes")
    static let defaultQuery = RecipeQuery()

    let id: UUID
    @Property(title: "Title")
    var title: String
    @Property(title: "Description", indexingKey: \.contentDescription)
    var summary: String?
    @Property(title: "Tags")
    var tags: [String]
    @Property(title: "Total Time (Minutes)")
    var totalTimeMinutes: Int?
    @Property(title: "Favorite")
    var isFavorite: Bool
    /// Ingredient lines and steps, for sharing and Spotlight.
    var ingredientLines: [String]
    var steps: [String]

    @MainActor
    init(_ recipe: Recipe) {
        id = recipe.uuid
        ingredientLines = recipe.ingredients.map { [Units.amount($0.quantity, $0.unit), $0.name].filter { !$0.isEmpty }.joined(separator: " ") }
        steps = recipe.steps.map(\.text)
        title = recipe.title
        summary = recipe.summary
        tags = recipe.tags
        totalTimeMinutes = recipe.totalTimeMinutes
        isFavorite = recipe.favorited
    }

    var displayRepresentation: DisplayRepresentation {
        let details = [totalTimeMinutes.map { "\($0) min" }, tags.first].compactMap { $0 }.joined(separator: " · ")
        return DisplayRepresentation(title: "\(title)", subtitle: details.isEmpty ? nil : "\(details)",
                                     image: .init(systemName: "book.pages"))
    }

    var attributeSet: CSSearchableItemAttributeSet {
        let attributes = CSSearchableItemAttributeSet()
        attributes.keywords = tags + ingredientLines
        return attributes
    }

    var plainText: String {
        var text = title
        if let summary, !summary.isEmpty { text += "\n\n\(summary)" }
        if !ingredientLines.isEmpty { text += "\n\nIngredients\n" + ingredientLines.map { "• \($0)" }.joined(separator: "\n") }
        if !steps.isEmpty { text += "\n\nSteps\n" + steps.enumerated().map { "\($0.offset + 1). \($0.element)" }.joined(separator: "\n") }
        return text
    }
}

extension RecipeEntity: Transferable {
    static var transferRepresentation: some TransferRepresentation {
        ProxyRepresentation(exporting: \.plainText)
    }
}

nonisolated struct RecipeQuery: EntityStringQuery {
    func entities(for identifiers: [UUID]) async throws -> [RecipeEntity] {
        await MainActor.run {
            let wanted = Set(identifiers)
            return Kitchen.shared.fetch(Recipe.self).filter { wanted.contains($0.uuid) }.map(RecipeEntity.init)
        }
    }

    func entities(matching string: String) async throws -> [RecipeEntity] {
        await MainActor.run {
            let recipes = Kitchen.shared.fetch(Recipe.self)
            let exact = recipes.filter { normalizeName($0.title) == normalizeName(string) }
            let matches = exact.isEmpty ? recipes.filter { $0.title.localizedStandardContains(string) || $0.tags.contains { $0.localizedStandardContains(string) } } : exact
            return matches.map(RecipeEntity.init)
        }
    }

    func suggestedEntities() async throws -> [RecipeEntity] {
        await MainActor.run {
            Kitchen.shared.fetch(Recipe.self)
                .sorted { ($0.favorited ? 1 : 0, $0.lastCookedAt ?? $0.createdAt) > ($1.favorited ? 1 : 0, $1.lastCookedAt ?? $1.createdAt) }
                .prefix(50)
                .map(RecipeEntity.init)
        }
    }
}

nonisolated enum StorageLocationEntity: String, AppEnum {
    case pantry, fridge, freezer

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Storage Location"
    static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
        .pantry: DisplayRepresentation(title: "Pantry", image: .init(systemName: "cabinet")),
        .fridge: DisplayRepresentation(title: "Fridge", image: .init(systemName: "refrigerator")),
        .freezer: DisplayRepresentation(title: "Freezer", image: .init(systemName: "snowflake")),
    ]

    var location: StorageLocation { StorageLocation(rawValue: rawValue) ?? .pantry }
}

struct PantryItemEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Pantry Item", numericFormat: "\(placeholder: .int) pantry items")
    static let defaultQuery = PantryItemQuery()

    let id: UUID
    @Property(title: "Name")
    var name: String
    @Property(title: "Quantity")
    var quantity: Double
    @Property(title: "Unit")
    var unit: String
    @Property(title: "Location")
    var location: StorageLocationEntity
    @Property(title: "Expires")
    var expiresOn: Date?
    /// Quantity and unit as people say them, e.g. "1½ cup".
    var amount: String

    @MainActor
    init(_ item: PantryItem) {
        id = item.uuid
        amount = Units.amount(item.quantity, item.unit)
        name = item.name
        quantity = item.quantity
        unit = item.unit
        location = StorageLocationEntity(rawValue: item.location.rawValue) ?? .pantry
        expiresOn = item.expiresOn
    }

    var displayRepresentation: DisplayRepresentation {
        var details = [amount, location.location.title]
        if let expiresOn { details.append("expires \(expiresOn.formatted(.relative(presentation: .named)))") }
        return DisplayRepresentation(title: "\(name)", subtitle: "\(details.joined(separator: " · "))",
                                     image: .init(systemName: location.location.symbol))
    }
}

nonisolated struct PantryItemQuery: EntityStringQuery {
    func entities(for identifiers: [UUID]) async throws -> [PantryItemEntity] {
        await MainActor.run {
            let wanted = Set(identifiers)
            return Kitchen.shared.fetch(PantryItem.self).filter { wanted.contains($0.uuid) }.map(PantryItemEntity.init)
        }
    }

    func entities(matching string: String) async throws -> [PantryItemEntity] {
        await MainActor.run {
            Kitchen.bestMatches(for: string, in: Kitchen.shared.onHand(), name: \.name).map(PantryItemEntity.init)
        }
    }

    func suggestedEntities() async throws -> [PantryItemEntity] {
        await MainActor.run { Kitchen.shared.onHand().prefix(50).map(PantryItemEntity.init) }
    }
}

struct ShoppingItemEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Shopping List Item", numericFormat: "\(placeholder: .int) shopping list items")
    static let defaultQuery = ShoppingItemQuery()

    let id: UUID
    @Property(title: "Name")
    var name: String
    @Property(title: "Amount")
    var amount: String?
    @Property(title: "Category")
    var category: String?
    @Property(title: "Checked Off")
    var isChecked: Bool

    @MainActor
    init(_ item: ShoppingItem) {
        id = item.uuid
        name = item.name
        amount = item.quantity == nil ? nil : Units.amount(item.quantity, item.unit)
        category = item.category
        isChecked = item.checked
    }

    var displayRepresentation: DisplayRepresentation {
        let details = [amount, category].compactMap { $0 }.joined(separator: " · ")
        return DisplayRepresentation(title: "\(name)", subtitle: details.isEmpty ? nil : "\(details)",
                                     image: .init(systemName: isChecked ? "checkmark.circle.fill" : "circle"))
    }
}

nonisolated struct ShoppingItemQuery: EntityStringQuery {
    func entities(for identifiers: [UUID]) async throws -> [ShoppingItemEntity] {
        await MainActor.run {
            let wanted = Set(identifiers)
            return Kitchen.shared.fetch(ShoppingItem.self).filter { wanted.contains($0.uuid) }.map(ShoppingItemEntity.init)
        }
    }

    func entities(matching string: String) async throws -> [ShoppingItemEntity] {
        await MainActor.run {
            Kitchen.bestMatches(for: string, in: Kitchen.shared.openShoppingItems(), name: \.name).map(ShoppingItemEntity.init)
        }
    }

    func suggestedEntities() async throws -> [ShoppingItemEntity] {
        await MainActor.run { Kitchen.shared.openShoppingItems().map(ShoppingItemEntity.init) }
    }
}

/// Keeps recipes in Spotlight's semantic index, which is where Siri looks
/// for them, and refreshes the recipe names App Shortcut phrases accept.
enum KitchenIndex {
    static func refresh(_ kitchen: Kitchen) async {
        let index = CSSearchableIndex(name: "SousChefRecipes")
        let recipes = kitchen.fetch(Recipe.self).map(RecipeEntity.init)
        do {
            try await index.deleteAllSearchableItems()
            try await index.indexAppEntities(recipes)
        } catch {
            print("Spotlight indexing failed: \(error)")
        }
        SousChefShortcuts.updateAppShortcutParameters()
    }
}
