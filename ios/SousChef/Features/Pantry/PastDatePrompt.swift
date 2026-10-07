import SwiftUI

extension View {
    /// Asks whether food past its date was used up or thrown away, for the
    /// Pantry's "This month" tally. Either way the item stays as Out.
    func pastDatePrompt(for item: Binding<PantryItem?>, choose: @escaping (PantryItem, PantryOutcome.Kind) -> Void) -> some View {
        confirmationDialog(
            item.wrappedValue.map { "\($0.name) is past its date" } ?? "",
            isPresented: Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } }),
            titleVisibility: .visible,
            presenting: item.wrappedValue
        ) { target in
            Button("Used") { choose(target, .used) }
            Button("Thrown away", role: .destructive) { choose(target, .wasted) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Did you use it up, or throw it away? It stays in your pantry as Out.")
        }
    }
}
