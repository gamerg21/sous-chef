import AppIntents
import Foundation
import SwiftUI

// Siri and Shortcuts actions. Apple has no food, recipe or grocery app
// schema, so these are custom intents that Siri reaches through the App
// Shortcut phrases in `SousChefShortcuts`. Opening a recipe also adopts the
// `.system.open` schema on iOS 27 so Apple Intelligence can find it freely.

nonisolated enum KitchenIntentError: Error, CustomLocalizedStringResourceConvertible {
    case recipeMissing
    case aiUnavailable(String)

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .recipeMissing: "That recipe isn't in your kitchen anymore."
        case .aiUnavailable(let reason): "Sous Chef can't create recipes right now. \(reason)"
        }
    }
}

@MainActor
private func recipe(_ entity: RecipeEntity) throws -> Recipe {
    guard let recipe = Kitchen.shared.fetch(Recipe.self).first(where: { $0.uuid == entity.id }) else { throw KitchenIntentError.recipeMissing }
    return recipe
}

// MARK: Pantry

struct ShowPantryIntent: AppIntent {
    static let title: LocalizedStringResource = "Check Pantry"
    static let description = IntentDescription("Lists the food on hand in your pantry, fridge or freezer, soonest to expire first.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Location")
    var location: StorageLocationEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Check what's in the \(\.$location)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[PantryItemEntity]> & ProvidesDialog & ShowsSnippetView {
        let items = Kitchen.shared.onHand(in: location?.location)
        let place = location.map { "your \($0.location.title.lowercased())" } ?? "your kitchen"
        let dialog: String
        if items.isEmpty {
            dialog = "There's nothing in \(place) right now."
        } else {
            dialog = "You have \(items.count) \(items.count == 1 ? "item" : "items") in \(place): \(Kitchen.spokenList(items.map(\.name)))."
        }
        return .result(value: items.map(PantryItemEntity.init), dialog: "\(dialog)",
                       view: KitchenSnippet(rows: items.prefix(8).map(PantryItemEntity.init).map(\.row)))
    }
}

struct ExpiringSoonIntent: AppIntent {
    static let title: LocalizedStringResource = "Check What's Expiring"
    static let description = IntentDescription("Lists food that expires in the next few days, so you can use it up.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Days", default: 3, inclusiveRange: (1, 30))
    var days: Int

    static var parameterSummary: some ParameterSummary {
        Summary("Check what expires in the next \(\.$days) days")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[PantryItemEntity]> & ProvidesDialog & ShowsSnippetView {
        let items = Kitchen.shared.expiringSoon(within: days)
        let dialog = items.isEmpty
            ? "Nothing expires in the next \(days) days."
            : "Use these soon: \(Kitchen.spokenList(items.map(\.name)))."
        return .result(value: items.map(PantryItemEntity.init), dialog: "\(dialog)",
                       view: KitchenSnippet(rows: items.prefix(8).map(PantryItemEntity.init).map(\.row)))
    }
}

struct RanOutIntent: AppIntent {
    static let title: LocalizedStringResource = "Mark Food as Used Up"
    static let description = IntentDescription("Empties a food in your pantry and adds it to your shopping list.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Food", requestValueDialog: "What ran out?")
    var food: String

    static var parameterSummary: some ParameterSummary {
        Summary("Mark \(\.$food) as used up")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let kitchen = Kitchen.shared
        var food = food
        let onHand = kitchen.onHand()
        if !onHand.contains(where: { normalizeName($0.name) == normalizeName(food) }),
           let guess = Kitchen.bestMatches(for: food, in: onHand, name: \.name).first {
            // "Milk" may mean "Whole milk", but never guess silently.
            try await requestConfirmation(actionName: .set, dialog: "Did you mean \(guess.name)?")
            food = guess.name
        }
        let result = kitchen.ranOut(of: food)
        let name = result.emptied.first?.name ?? food
        let dialog: String = switch (result.emptied.isEmpty, result.addedToList) {
        case (false, true): "Marked \(name) as used up and added it to your shopping list."
        case (false, false): "Marked \(name) as used up. It's already on your shopping list."
        case (true, true): "Added \(name) to your shopping list."
        case (true, false): "\(name.capitalized) is already on your shopping list."
        }
        return .result(dialog: "\(dialog)")
    }
}

// MARK: Recipes

struct SuggestRecipeIntent: AppIntent {
    static let title: LocalizedStringResource = "Suggest a Recipe"
    static let description = IntentDescription("Picks the saved recipes you can make with what's in your pantry, favoring food that expires soon.")
    static let supportedModes: IntentModes = .background

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[RecipeEntity]> & ProvidesDialog & ShowsSnippetView {
        let suggestions = Kitchen.shared.suggestRecipes()
        guard let best = suggestions.first else {
            return .result(value: [], dialog: "None of your saved recipes use what's in your pantry yet. Ask Sous Chef for a new recipe idea instead.",
                           view: KitchenSnippet(rows: []))
        }
        var dialog = Self.sentence(for: best)
        let others = suggestions.dropFirst().map(\.recipe.title)
        if !others.isEmpty { dialog += " Or try \(ListFormatter.localizedString(byJoining: others).replacingOccurrences(of: " and ", with: " or "))." }
        return .result(value: suggestions.map { RecipeEntity($0.recipe) }, dialog: "\(dialog)",
                       view: KitchenSnippet(rows: suggestions.map(\.row)))
    }

    @MainActor static func sentence(for suggestion: Kitchen.RecipeSuggestion) -> String {
        let title = suggestion.recipe.title
        let missing = suggestion.plan.missingIngredients.map(\.name)
        var text = missing.isEmpty
            ? "You can make \(title) with what you have."
            : "\(title) is closest. You're missing \(Kitchen.spokenList(missing, limit: 3))."
        if !suggestion.usesExpiring.isEmpty { text += " It uses up food that expires soon." }
        return text
    }
}

struct NewRecipeIdeaIntent: AppIntent {
    static let title: LocalizedStringResource = "Create a Recipe Idea"
    static let description = IntentDescription("Drafts a new recipe built around your pantry, then saves it if you like it.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Request", description: "Anything to steer the idea, like \"something spicy\" or \"ready in 20 minutes\".")
    var request: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Create a recipe idea for \(\.$request)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<RecipeEntity> & ProvidesDialog {
        let kitchen = Kitchen.shared
        if case .unavailable(let reason) = kitchen.ai.engine { throw KitchenIntentError.aiUnavailable(reason) }
        let draft = try await kitchen.ai.generateRecipe(pantry: kitchen.onHand(), preferences: request ?? "")
        let time = draft.totalTimeMinutes.map { " It takes about \($0) minutes." } ?? ""
        try await requestConfirmation(actionName: .add, dialog: "How about \(draft.title)? \(draft.summary ?? "")\(time) Add it to your recipes?")
        let saved = kitchen.save(draft)
        return .result(value: RecipeEntity(saved), dialog: "Saved \(saved.title) to your recipes.")
    }
}

/// A plain intent rather than `OpenIntent`: the system allows one open
/// intent per entity, and that's the schema version below.
struct OpenRecipeIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Recipe"
    static let description = IntentDescription("Opens a recipe in Sous Chef.")
    static let supportedModes: IntentModes = .foreground(.immediate)

    @Parameter(title: "Recipe")
    var target: RecipeEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Open \(\.$target)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        AppNavigator.shared.open(recipe: try recipe(target).uuid)
        return .result()
    }
}

/// The same action under Apple's `.system.open` schema, so Apple Intelligence
/// can open recipes without an exact phrase. Hidden from Shortcuts, where
/// `OpenRecipeIntent` already appears.
@available(iOS 27.0, *)
@AppIntent(schema: .system.open)
struct OpenRecipeAssistantIntent: OpenIntent {
    static let isAssistantOnly = true

    var target: RecipeEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        AppNavigator.shared.open(recipe: try recipe(target).uuid)
        return .result()
    }
}

struct StartCookingIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Cooking"
    static let description = IntentDescription("Opens a recipe in Cook mode, one step at a time.")
    static let supportedModes: IntentModes = .foreground(.immediate)

    @Parameter(title: "Recipe")
    var recipe: RecipeEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Start cooking \(\.$recipe)")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        AppNavigator.shared.open(recipe: try SousChef.recipe(recipe).uuid, cooking: true)
        return .result()
    }
}

struct AddRecipeShortagesIntent: AppIntent {
    static let title: LocalizedStringResource = "Add Missing Ingredients to Shopping List"
    static let description = IntentDescription("Adds whatever a recipe needs that your pantry doesn't have.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Recipe")
    var recipe: RecipeEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Add what \(\.$recipe) needs to the shopping list")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[ShoppingItemEntity]> & ProvidesDialog {
        let kitchen = Kitchen.shared
        let recipe = try SousChef.recipe(recipe)
        let missing = kitchen.plan(for: recipe).missingIngredients
        guard !missing.isEmpty else {
            return .result(value: [], dialog: "You already have everything for \(recipe.title).")
        }
        let added = kitchen.addShortages(for: recipe, missing: missing)
        let items = kitchen.openShoppingItems().filter { $0.recipeUUID == recipe.uuid }
        let dialog = added == 0
            ? "Everything \(recipe.title) needs is already on your shopping list."
            : "Added \(Kitchen.spokenList(missing.map(\.name))) to your shopping list."
        return .result(value: items.map(ShoppingItemEntity.init), dialog: "\(dialog)")
    }
}

// MARK: Shopping

struct AddToShoppingListIntent: AppIntent {
    static let title: LocalizedStringResource = "Add to Shopping List"
    static let description = IntentDescription("Adds one or more items to your shopping list, like \"milk, eggs and bread\".")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Items", requestValueDialog: "What should I add?")
    var items: String

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$items) to the shopping list")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[ShoppingItemEntity]> & ProvidesDialog {
        let names = Kitchen.splitSpokenList(items)
        let added = Kitchen.shared.addToShoppingList(names)
        let dialog: String
        if names.isEmpty {
            dialog = "I didn't catch anything to add."
        } else if added.isEmpty {
            dialog = names.count == 1 ? "\(names[0].capitalized) is already on your shopping list." : "Those are already on your shopping list."
        } else {
            dialog = "Added \(Kitchen.spokenList(added.map(\.name))) to your shopping list."
        }
        return .result(value: added.map(ShoppingItemEntity.init), dialog: "\(dialog)")
    }
}

struct ShowShoppingListIntent: AppIntent {
    static let title: LocalizedStringResource = "Read Shopping List"
    static let description = IntentDescription("Lists what's still on your shopping list.")
    static let supportedModes: IntentModes = .background

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<[ShoppingItemEntity]> & ProvidesDialog & ShowsSnippetView {
        let items = Kitchen.shared.openShoppingItems()
        let dialog = items.isEmpty
            ? "Your shopping list is empty."
            : "You have \(items.count) \(items.count == 1 ? "thing" : "things") on your shopping list: \(Kitchen.spokenList(items.map(\.name), limit: 8))."
        return .result(value: items.map(ShoppingItemEntity.init), dialog: "\(dialog)",
                       view: KitchenSnippet(rows: items.prefix(10).map(ShoppingItemEntity.init).map(\.row)))
    }
}

struct CheckOffShoppingItemIntent: AppIntent {
    static let title: LocalizedStringResource = "Check Off Shopping List Item"
    static let description = IntentDescription("Checks an item off your shopping list.")
    static let supportedModes: IntentModes = .background

    @Parameter(title: "Item", requestValueDialog: "What did you pick up?")
    var item: String

    static var parameterSummary: some ParameterSummary {
        Summary("Check off \(\.$item)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let checked = Kitchen.shared.checkOff(item)
        let dialog = checked.isEmpty
            ? "I couldn't find \(item) on your shopping list."
            : "Checked off \(checked[0].name)."
        return .result(dialog: "\(dialog)")
    }
}

// MARK: Snippets

nonisolated struct SnippetRow: Hashable, Sendable {
    var title: String
    var detail: String
    var systemImage: String
}

private extension PantryItemEntity {
    var row: SnippetRow {
        let expiry = expiresOn.map { " · expires \($0.formatted(.relative(presentation: .named)))" } ?? ""
        return SnippetRow(title: name, detail: amount + expiry, systemImage: location.location.symbol)
    }
}

private extension ShoppingItemEntity {
    var row: SnippetRow { SnippetRow(title: name, detail: [amount, category].compactMap { $0 }.joined(separator: " · "), systemImage: "cart") }
}

private extension Kitchen.RecipeSuggestion {
    var row: SnippetRow {
        let missing = plan.missingIngredients.count
        return SnippetRow(title: recipe.title, detail: missing == 0 ? "Ready to cook" : "Missing \(missing)",
                          systemImage: missing == 0 ? "checkmark.seal" : "cart.badge.plus")
    }
}

/// The compact list Siri shows under its spoken answer.
struct KitchenSnippet: View {
    let rows: [SnippetRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 12) {
                    Image(systemName: row.systemImage)
                        .foregroundStyle(Color.brand)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.title).font(.body.weight(.medium))
                        if !row.detail.isEmpty {
                            Text(row.detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding()
    }
}
