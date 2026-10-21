import SwiftData
import SwiftUI

/// Shows a screen about one item (a recipe, a pantry item, a shopping item,
/// a planned meal) while it exists. Once another device deletes it (a
/// household member, or the companion server), shows a note instead of the
/// screen: reading a deleted item crashes SwiftData.
///
/// Wrap the screen's whole body, so the check runs before anything reads the
/// item: `var body: some View { DeletedElsewhereGuard(recipe) { content } }`.
struct DeletedElsewhereGuard<Content: View>: View {
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    private let model: (any PersistentModel)?
    private let content: () -> Content

    init(_ model: (any PersistentModel)?, @ViewBuilder content: @escaping () -> Content) {
        self.model = model
        self.content = content
    }

    var body: some View {
        if let model, kitchen.wasDeletedElsewhere(model) {
            ContentUnavailableView {
                Label("Deleted on another device", systemImage: "trash")
            } description: {
                Text("Someone deleted this while you had it open.")
            } actions: {
                Button("Close") { dismiss() }
                    .buttonStyle(.borderedProminent)
            }
        } else {
            content()
        }
    }
}
