import SwiftUI
import UIKit

extension Notification.Name {
    static let deviceDidShake = Notification.Name("SousChef.deviceDidShake")
}

#if targetEnvironment(simulator)
extension UIWindow {
    // The simulator has no accelerometer; Device > Shake reaches the window.
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        super.motionEnded(motion, with: event)
        if motion == .motionShake { NotificationCenter.default.post(name: .deviceDidShake, object: nil) }
    }
}
#endif

extension View {
    /// Shaking the device after deleting something offers to bring it back,
    /// when Shake to undo is on in Settings.
    func undoDeleteOnShake() -> some View { modifier(UndoDeleteOnShake()) }
}

private struct UndoDeleteOnShake: ViewModifier {
    @Environment(Kitchen.self) private var kitchen
    @AppStorage(Kitchen.undoBarKey) private var showsBar = false
    @AppStorage(Kitchen.shakeToUndoKey) private var shakeToUndo = false
    @Environment(\.scenePhase) private var scenePhase
    @State private var offering: String?
    @State private var bar: Kitchen.UndoableDelete?

    private var listening: Bool {
        shakeToUndo && UIAccessibility.isShakeToUndoEnabled && scenePhase == .active
    }

    private func offerUndo() {
        let undo = kitchen.deletionUndo
        guard undo.canUndo, offering == nil else { return }
        bar = nil
        offering = undo.undoActionName
    }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if let bar {
                    UndoBar(name: bar.name) {
                        self.bar = nil
                        kitchen.deletionUndo.undo()
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
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
            // The accelerometer runs only while shaking can do something.
            .task(id: listening) {
                guard listening else { return }
                for await _ in ShakeDetector.shakes() { offerUndo() }
            }
            .onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in
                if listening { offerUndo() }
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

/// "Deleted Lemons · Undo", floating just above the tab bar for a few
/// seconds after a delete when the setting is on.
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
        // Clear of the tab bar, which this sits outside of.
        .padding(.bottom, 62)
    }
}
