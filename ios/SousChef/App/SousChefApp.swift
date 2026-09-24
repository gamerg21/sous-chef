import SwiftData
import SwiftUI

@main
struct SousChefApp: App {
    @State private var kitchen = Kitchen(inMemory: ProcessInfo.processInfo.arguments.contains("-uiTesting"))
    @State private var moderation = CommunityModeration.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(kitchen)
                .environment(moderation)
                .modelContainer(kitchen.container)
                .tint(.brand)
                .task { SampleKitchen.seedIfRequested(into: kitchen) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await kitchen.server.syncNow() } }
        }
    }
}

enum AppTab: String, Hashable {
    case pantry, recipes, cook, shopping, community
}

struct RootView: View {
    @Environment(Kitchen.self) private var kitchen
    /// `-startTab recipes` opens a tab directly, for screenshots.
    @State private var tab: AppTab = UserDefaults.standard.string(forKey: "startTab").flatMap(AppTab.init(rawValue:)) ?? .pantry
    @State private var showSettings = false
    @AppStorage("onboarding.done") private var onboardingDone = false
    @Query(filter: #Predicate<ShoppingItem> { !$0.checked }) private var openShopping: [ShoppingItem]

    var body: some View {
        TabView(selection: $tab) {
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
        .sheet(isPresented: $showSettings) {
            SettingsView()
        }
        .fullScreenCover(isPresented: Binding(get: { !onboardingDone }, set: { onboardingDone = !$0 })) {
            OnboardingView { onboardingDone = true }
        }
    }
}
