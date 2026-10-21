import SwiftUI

/// A short sheet that slides up from the bottom to confirm something (or to
/// tell the person what just happened): an icon, a title, what it means,
/// and one or two full-width buttons. Sized to fit its text.
struct ConfirmSheet: View {
    let systemImage: String
    let title: String
    let message: String
    /// The main button, such as "Remove" or "OK".
    let action: String
    /// Red for something that can't be undone; the brand color for a notice.
    var tint: Color = .red
    /// The way out, such as "Keep"; nil shows only the main button.
    var cancel: String? = "Cancel"
    var actionIdentifier: String? = nil
    var onConfirm: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @State private var height: CGFloat = 340

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: systemImage)
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 60, height: 60)
                .background(tint.opacity(0.15), in: Circle())
                .accessibilityHidden(true)
            VStack(spacing: 8) {
                Text(title)
                    .font(.title3.bold())
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 10) {
                Button {
                    dismiss()
                    onConfirm()
                } label: {
                    Text(action).font(.headline).frame(maxWidth: .infinity, minHeight: 32)
                }
                .buttonStyle(.borderedProminent)
                .tint(tint)
                .accessibilityIdentifier(actionIdentifier ?? "")
                if let cancel {
                    Button {
                        dismiss()
                    } label: {
                        Text(cancel).font(.headline).foregroundStyle(.primary).frame(maxWidth: .infinity, minHeight: 32)
                    }
                    .buttonStyle(.bordered)
                    .tint(.secondary)
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 32)
        .padding(.bottom, 12)
        .fixedSize(horizontal: false, vertical: true)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
        .presentationDetents([.height(height)])
        .presentationDragIndicator(.visible)
    }
}
