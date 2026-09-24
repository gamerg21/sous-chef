import AppIntents

/// Spoken phrases that work with Siri as soon as the app is installed.
/// Apple allows ten; the rest of the intents appear in Shortcuts.
nonisolated struct SousChefShortcuts: AppShortcutsProvider {
    static let shortcutTileColor: ShortcutTileColor = .orange

    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: SuggestRecipeIntent(), phrases: [
            "What can I make with \(.applicationName)",
            "What should I cook with \(.applicationName)",
            "Suggest a recipe in \(.applicationName)",
            "Find a \(.applicationName) recipe for dinner",
        ], shortTitle: "Suggest a Recipe", systemImageName: "sparkles")

        AppShortcut(intent: ShowPantryIntent(), phrases: [
            "What's in my \(.applicationName) pantry",
            "Check my pantry in \(.applicationName)",
            "What's in my \(\.$location) in \(.applicationName)",
            "Check the \(\.$location) in \(.applicationName)",
        ], shortTitle: "Check Pantry", systemImageName: "cabinet")

        AppShortcut(intent: ExpiringSoonIntent(), phrases: [
            "What's expiring in \(.applicationName)",
            "What should I use up in \(.applicationName)",
            "What's going bad in \(.applicationName)",
        ], shortTitle: "Expiring Soon", systemImageName: "clock.badge.exclamationmark")

        AppShortcut(intent: AddToShoppingListIntent(), phrases: [
            "Add to my \(.applicationName) shopping list",
            "Add something to my shopping list in \(.applicationName)",
            "Add to my \(.applicationName) list",
        ], shortTitle: "Add to Shopping List", systemImageName: "cart.badge.plus")

        AppShortcut(intent: ShowShoppingListIntent(), phrases: [
            "What's on my \(.applicationName) shopping list",
            "Read my shopping list in \(.applicationName)",
            "What do I need to buy in \(.applicationName)",
        ], shortTitle: "Shopping List", systemImageName: "cart")

        AppShortcut(intent: RanOutIntent(), phrases: [
            "I ran out of something in \(.applicationName)",
            "Mark something as used up in \(.applicationName)",
            "Tell \(.applicationName) I'm out of something",
        ], shortTitle: "Used Up", systemImageName: "minus.circle")

        AppShortcut(intent: NewRecipeIdeaIntent(), phrases: [
            "Give me a new recipe idea in \(.applicationName)",
            "Create a recipe with \(.applicationName)",
            "Invent a recipe in \(.applicationName)",
        ], shortTitle: "New Recipe Idea", systemImageName: "wand.and.stars")

        AppShortcut(intent: AddRecipeShortagesIntent(), phrases: [
            "Add what I need for \(\.$recipe) to my \(.applicationName) list",
            "Shop for \(\.$recipe) in \(.applicationName)",
        ], shortTitle: "Shop for a Recipe", systemImageName: "list.bullet.clipboard")

        AppShortcut(intent: StartCookingIntent(), phrases: [
            "Start cooking \(\.$recipe) in \(.applicationName)",
            "Cook \(\.$recipe) with \(.applicationName)",
        ], shortTitle: "Start Cooking", systemImageName: "flame")

        AppShortcut(intent: OpenRecipeIntent(), phrases: [
            "Open \(\.$target) in \(.applicationName)",
            "Show the \(\.$target) recipe in \(.applicationName)",
        ], shortTitle: "Open Recipe", systemImageName: "book.pages")
    }
}
