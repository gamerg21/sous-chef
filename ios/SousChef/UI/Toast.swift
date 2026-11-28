import SwiftUI

/// A short confirmation shown for a moment, like the "Deleted Lemons · Undo"
/// bar: a capsule at the bottom of the screen it belongs to.
struct Toast: Equatable {
    /// A new one each time, so repeating a message restarts its timer.
    let id = UUID()
    var message: String
    var systemImage = "checkmark.circle.fill"

    init(_ message: String) {
        self.message = message
    }
}

extension View {
    /// Shows `toast` at the bottom of this screen, then clears it. It sits
    /// inside the safe area, so it stays above the tab bar and whatever is
    /// seated on it, and away from the cards at the top.
    func toast(_ toast: Binding<Toast?>) -> some View { modifier(ToastPresenter(toast: toast)) }
}

private struct ToastPresenter: ViewModifier {
    @Binding var toast: Toast?

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            ZStack {
                if let toast {
                    Label(toast.message, systemImage: toast.systemImage)
                        .font(.callout.weight(.medium))
                        .symbolRenderingMode(.multicolor)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                        .glassEffect(.regular, in: .capsule)
                        .padding(.horizontal)
                        .padding(.bottom, 12 + resumeBarHeight)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        // Each message restarts the timer.
                        .task(id: toast.id) {
                            try? await Task.sleep(for: .seconds(2.2))
                            guard !Task.isCancelled else { return }
                            self.toast = nil
                        }
                }
            }
            .animation(.snappy, value: toast)
            .allowsHitTesting(false)
        }
    }

    /// Room for the resume-cooking bar where it floats over the screen
    /// (iOS 26.0, and on a Mac) instead of sitting on the tab bar, which the
    /// safe area already allows for.
    private var resumeBarHeight: CGFloat {
        let sessions = CookSessionStore.shared
        guard sessions.session != nil, sessions.showing == nil else { return 0 }
        if ProcessInfo.processInfo.isiOSAppOnMac { return 64 }
        if #available(iOS 26.1, *) { return 0 }
        return 64
    }
}
