import SwiftUI
import WidgetKit

/// Everything the widget extension offers. Widgets read the app's
/// `KitchenSnapshot` from the App Group and never open the kitchen store.
@main
struct SousChefWidgetsBundle: WidgetBundle {
    var body: some Widget {
        TonightWidget()
        ExpiringSoonWidget()
        ShoppingListWidget()
        CookTimerLiveActivity()
    }
}

extension Color {
    static let brand = Color("AccentColor")
}
