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
    /// Shaking the device after deleting something offers to bring it back,
    /// when Shake to undo is on in Settings.
    func undoDeleteOnShake() -> some View { modifier(UndoDeleteOnShake()) }
}

private struct UndoDeleteOnShake: ViewModifier {
    @Environment(Kitchen.self) private var kitchen
    @AppStorage(Kitchen.undoBarKey) private var showsBar = false
    @AppStorage(Kitchen.shakeToUndoKey) private var shakeToUndo = false
    @State private var offering: String?
    @State private var bar: Kitchen.UndoableDelete?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let bar {
                    UndoBar(name: bar.name) {
                        self.bar = nil
                        kitchen.deletionUndo.undo()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                    // Each delete restarts the timer.
                    .task(id: bar.id) {
                        try? await Task.sleep(for: .seconds(5))
                        withAnimation(.smooth) { self.bar = nil }
                    }
                }
            }
            .animation(.smooth, value: bar)
            .onChange(of: kitchen.lastUndoableDelete) { _, delete in
                guard showsBar, let delete else { return }
                bar = delete
            }
            .onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in
                let undo = kitchen.deletionUndo
                guard shakeToUndo, UIAccessibility.isShakeToUndoEnabled, undo.canUndo, offering == nil else { return }
                bar = nil
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

/// "Deleted Lemons · Undo", shown briefly at the top after a delete when
/// the setting is on.
private struct UndoBar: View {
    let name: String
    let undo: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "trash").foregroundStyle(.secondary)
            Text("Deleted \(name)").lineLimit(1)
            Spacer(minLength: 8)
            Button("Undo", action: undo)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.brand)
                .accessibilityIdentifier("undoBar")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .glassEffect(.regular, in: .capsule)
        .padding(.horizontal)
        .padding(.top, 4)
    }
}
