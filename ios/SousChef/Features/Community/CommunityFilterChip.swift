import SwiftUI

/// A selectable capsule for the feed and tag filters, with a full-height tap target.
struct CommunityFilterChip: View {
    let title: String
    var systemImage: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage { Image(systemName: systemImage).imageScale(.small) }
                Text(title).lineLimit(1)
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .background(selected ? AnyShapeStyle(Color.brand) : AnyShapeStyle(.background.secondary), in: .capsule)
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
