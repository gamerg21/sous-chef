import SwiftUI

/// The heart and like count of a community recipe. A tap shows at once and is
/// put back if the community refuses it; without an account it asks for one.
struct CommunityLikeButton: View {
    let listing: Community.Listing
    /// A bordered capsule with the word "Like", for the recipe's page.
    var prominent = false
    @Environment(CommunitySocial.self) private var social

    var body: some View {
        let state = social.like(for: listing)
        Button(action: toggle) {
            HStack(spacing: 6) {
                Image(systemName: state.liked ? "heart.fill" : "heart")
                    .foregroundStyle(state.liked ? Color.pink : Color.secondary)
                    .symbolEffect(.bounce, value: state.liked)
                Text(state.count, format: .number)
                    .monospacedDigit()
                    .contentTransition(.numericText(value: Double(state.count)))
                    .foregroundStyle(prominent ? Color.primary : Color.secondary)
            }
            .font(prominent ? .body.weight(.semibold) : .subheadline.weight(.medium))
            .padding(.horizontal, prominent ? 16 : 6)
            .frame(minWidth: 44, minHeight: 44)
            .background { if prominent { Capsule().fill(.background.secondary) } }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .animation(.snappy, value: state)
        .sensoryFeedback(.selection, trigger: state.liked)
        .accessibilityLabel("Like")
        .accessibilityValue(state.liked ? "Liked, \(CommunityText.count(state.count, "like"))" : CommunityText.count(state.count, "like"))
        .accessibilityHint(state.liked ? "Removes your like." : "Likes this recipe.")
        .accessibilityAddTraits(state.liked ? .isSelected : [])
        .accessibilityIdentifier("communityLike")
    }

    private func toggle() {
        guard social.requireAccount() else { return }
        Task {
            do { try await social.toggleLike(listing) } catch { social.report(error) }
        }
    }
}
