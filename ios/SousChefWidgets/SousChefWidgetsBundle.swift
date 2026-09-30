import SwiftUI
import WidgetKit

/// Everything the widget extension offers. Widgets read the app's
/// `KitchenSnapshot` from the App Group and never open the kitchen store.
///
/// A "Tonight's meal" widget goes here once meal planning adds
/// `KitchenSnapshot.tonight`: a `TonightWidget` that reads it through
/// `KitchenTimelineProvider`, like `ExpiringSoonWidget`.
@main
struct SousChefWidgetsBundle: WidgetBundle {
    var body: some Widget {
        ExpiringSoonWidget()
        ShoppingListWidget()
        CookTimerLiveActivity()
    }
}

extension Color {
    static let brand = Color("AccentColor")
}
