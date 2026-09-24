import SwiftData
import SwiftUI

@main
struct SousChefApp: App {
    @State private var kitchen = Kitchen.shared
    @State private var moderation = CommunityModeration.shared
    @State private var account = CommunityAccount.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(kitchen)
                .environment(moderation)
                .environment(account)
                .modelContainer(kitchen.container)
                .tint(.brand)
                .task { SampleKitchen.seedIfRequested(into: kitchen) }
                .task { await account.checkCredentialState() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await kitchen.server.syncNow() }
                Task { await account.checkCredentialState() }
            }
            if phase != .inactive { Task { await KitchenIndex.refresh(kitchen) } }
        }
    }
}

enum AppTab: String, Hashable {
    case pantry, recipes, cook, shopping, community
}

/// Where Siri and Shortcuts send the person when an intent opens the app.
@Observable
final class AppNavigator {
    static let shared = AppNavigator()

    /// `-startTab recipes` opens a tab directly, for screenshots.
    var tab: AppTab = UserDefaults.standard.string(forKey: "startTab").flatMap(AppTab.init(rawValue:)) ?? .pantry
    /// A recipe to push on the Recipes tab, taken by `RecipesView`.
    var recipeToOpen: UUID?
    /// A recipe to open straight into Cook mode, taken by its `RecipeDetailView`.
    var recipeToCook: UUID?

    func open(recipe id: UUID, cooking: Bool = false) {
        tab = .recipes
        recipeToCook = cooking ? id : nil
        recipeToOpen = id
    }
}

struct RootView: View {
    @Environment(Kitchen.self) private var kitchen
    @Bindable private var navigator = AppNavigator.shared
    @State private var showSettings = false
    @AppStorage("onboarding.done") private var onboardingDone = false
    @Query(filter: #Predicate<ShoppingItem> { !$0.checked }) private var openShopping: [ShoppingItem]

    var body: some View {
        TabView(selection: $navigator.tab) {
            Tab("Pantry", systemImage: "cabinet", value: AppTab.pantry) {
                PantryView(showSettings: $showSettings)
            }
            Tab("Recipes", systemImage: "book.pages", value: AppTab.recipes) {
                RecipesView(showSettings: $showSettings)
            }
            Tab("Cook", systemImage: "frying.pan", value: AppTab.cook) {
                CookView(showSettings: $showSettings)
            }
            Tab("Shopping", systemImage: "cart", value: AppTab.shopping) {
                ShoppingView(showSettings: $showSettings)
            }
            .badge(openShopping.count)
            Tab("Community", systemImage: "person.2", value: AppTab.community) {
                CommunityView(showSettings: $showSettings)
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .tabBarMinimizeBehavior(.onScrollDown)
        // Rebuild on the new store when iCloud sync is switched on or off.
        .id(kitchen.storeGeneration)
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .fullScreenCover(isPresented: Binding(get: { !onboardingDone }, set: { onboardingDone = !$0 })) {
            OnboardingView { onboardingDone = true }
        }
    }
}
