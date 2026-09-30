import SwiftData
import SwiftUI

@main
struct SousChefApp: App {
    @State private var kitchen = Kitchen.shared
    @State private var account = CommunityAccount.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Sample data in an in-memory kitchen skips onboarding without saving
        // that, so a test run never hides onboarding from the real app.
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("-uiTesting"), arguments.contains("-seedSample") {
            UserDefaults.standard.register(defaults: ["onboarding.done": true])
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .kitchenEnvironment(kitchen)
                .tint(.brand)
                .task { SampleKitchen.seedIfRequested(into: kitchen) }
                .task { await account.checkCredentialState() }
                .task { AppNavigator.shared.receiveSharedRecipes() }
                .onOpenURL { _ in AppNavigator.shared.receiveSharedRecipes() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                AppNavigator.shared.receiveSharedRecipes()
                Task { await kitchen.server.syncNow() }
                Task { await account.checkCredentialState() }
            }
            if phase != .inactive { Task { await KitchenIndex.refresh(kitchen) } }
        }
    }
}

enum AppTab: String, Hashable, CaseIterable {
    case pantry, recipes, cook, shopping, community

    var title: LocalizedStringKey {
        switch self {
        case .pantry: "Pantry"
        case .recipes: "Recipes"
        case .cook: "Cook"
        case .shopping: "Shopping"
        case .community: "Community"
        }
    }

    var systemImage: String {
        switch self {
        case .pantry: "cabinet"
        case .recipes: "book.pages"
        case .cook: "frying.pan"
        case .shopping: "cart"
        case .community: "person.2"
        }
    }
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

    /// Links and text shared from other apps, imported one at a time by `RecipesView`.
    var sharedRecipes: [SharedRecipeInbox.Item] = []

    /// Whether the Mac sidebar is showing.
    var showsSidebar = true

    func open(recipe id: UUID, cooking: Bool = false) {
        tab = .recipes
        recipeToCook = cooking ? id : nil
        recipeToOpen = id
    }

    /// Takes whatever the share extension left and switches to Recipes to import it.
    func receiveSharedRecipes() {
        let items = SharedRecipeInbox.take().filter { !sharedRecipes.contains($0) }
        guard !items.isEmpty else { return }
        sharedRecipes += items
        tab = .recipes
    }
}

struct RootView: View {
    @Environment(Kitchen.self) private var kitchen
    @Bindable private var navigator = AppNavigator.shared
    @State private var showSettings = false
    @AppStorage("onboarding.done") private var onboardingDone = false
    @Query(filter: #Predicate<ShoppingItem> { !$0.checked }) private var openShopping: [ShoppingItem]

    var body: some View {
        Group {
            if ProcessInfo.processInfo.isiOSAppOnMac { macLayout } else { tabs }
        }
        // Rebuild on the new store when iCloud sync is switched on or off.
        .id(kitchen.storeGeneration)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .kitchenEnvironment(kitchen)
        }
        .fullScreenCover(isPresented: Binding(get: { !onboardingDone }, set: { onboardingDone = !$0 })) {
            OnboardingView { onboardingDone = true }
                .kitchenEnvironment(kitchen)
        }
    }

    private var tabs: some View {
        TabView(selection: $navigator.tab) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                Tab(tab.title, systemImage: tab.systemImage, value: tab) { screen(for: tab) }
                    .badge(badge(for: tab))
            }
        }
        .tabViewStyle(.sidebarAdaptable)
        .tabBarMinimizeBehavior(.onScrollDown)
    }

    /// On a Mac the adaptable tab view's sidebar button turns the sidebar into
    /// the iPad tab bar, which looks out of place, so the Mac gets an ordinary
    /// sidebar that simply hides and shows. The system toggle sits at the
    /// sidebar's trailing edge, so ours replaces it at the leading edge.
    private var macLayout: some View {
        NavigationSplitView(columnVisibility: Binding(
            get: { navigator.showsSidebar ? .all : .detailOnly },
            set: { navigator.showsSidebar = $0 != .detailOnly }
        )) {
            List(selection: Binding<AppTab?>(get: { navigator.tab }, set: { if let tab = $0 { navigator.tab = tab } })) {
                ForEach(AppTab.allCases, id: \.self) { tab in
                    Label(tab.title, systemImage: tab.systemImage)
                        .badge(badge(for: tab))
                        .tag(tab)
                }
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 220)
            .background(SystemSidebarToggleRemover())
            .toolbar { ToolbarItem(placement: .topBarLeading) { SidebarButton() } }
        } detail: {
            screen(for: navigator.tab)
        }
    }

    @ViewBuilder private func screen(for tab: AppTab) -> some View {
        switch tab {
        case .pantry: PantryView(showSettings: $showSettings)
        case .recipes: RecipesView(showSettings: $showSettings)
        case .cook: CookView(showSettings: $showSettings)
        case .shopping: ShoppingView(showSettings: $showSettings)
        case .community: CommunityView(showSettings: $showSettings)
        }
    }

    private func badge(for tab: AppTab) -> Int { tab == .shopping ? openShopping.count : 0 }
}

extension View {
    /// The kitchen, community and store every screen expects.
    ///
    /// On a Mac, full-screen covers and sheets presented from other sheets
    /// don't inherit the environment, so every presentation passes it on
    /// again. Without it the app crashes on launch while showing onboarding.
    func kitchenEnvironment(_ kitchen: Kitchen = .shared) -> some View {
        environment(kitchen)
            .environment(CommunityModeration.shared)
            .environment(CommunityAccount.shared)
            .modelContainer(kitchen.container)
    }
}

/// Hides the split view's own sidebar button so `SidebarButton` can sit at the
/// leading edge instead. `.toolbar(removing: .sidebarToggle)` would do this,
/// but on a Mac it also makes the sidebar ignore its column width.
private struct SystemSidebarToggleRemover: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Probe { Probe() }
    func updateUIViewController(_ probe: Probe, context: Context) {}

    final class Probe: UIViewController {
        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            var controller = parent
            while let current = controller, !(current is UISplitViewController) { controller = current.parent }
            (controller as? UISplitViewController)?.displayModeButtonVisibility = .never
        }
    }
}
