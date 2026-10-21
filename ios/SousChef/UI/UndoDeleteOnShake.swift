import SwiftUI
import UIKit

extension Notification.Name {
    static let deviceDidShake = Notification.Name("SousChef.deviceDidShake")
}

extension UIWindow {
    // UIKit reports a shake to the window; SwiftUI has no shake event.
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        super.motionEnded(motion, with: event)
        if motion == .motionShake { NotificationCenter.default.post(name: .deviceDidShake, object: nil) }
    }
}

extension View {
    /// Shaking the device after deleting something offers to bring it back.
    func undoDeleteOnShake() -> some View { modifier(UndoDeleteOnShake()) }
}

private struct UndoDeleteOnShake: ViewModifier {
    @Environment(Kitchen.self) private var kitchen
    @State private var offering: String?

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in
                let undo = kitchen.deletionUndo
                guard undo.canUndo, offering == nil else { return }
                offering = undo.undoActionName
            }
            .sheet(isPresented: Binding(get: { offering != nil }, set: { if !$0 { offering = nil } })) {
                ConfirmSheet(systemImage: "arrow.uturn.backward", title: "Bring back \(offering ?? "it")?",
                             message: HouseholdSharing.shared.householdActive
                                 ? "It comes back as it was, for everyone in your household."
                                 : "It comes back as it was.",
                             action: "Undo delete", tint: .brand, actionIdentifier: "undoDelete") {
                    kitchen.deletionUndo.undo()
                }
            }
    }
}
