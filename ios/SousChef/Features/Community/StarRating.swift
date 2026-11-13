import SwiftUI

/// Five stars showing a rating; half stars for averages.
struct StarRating: View {
    let rating: Double
    var tint: Color = .orange

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { star in
                Image(systemName: symbol(for: star))
            }
        }
        .foregroundStyle(tint)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Rated \(CommunityText.rating(rating)) out of 5")
    }

    private func symbol(for star: Int) -> String {
        if rating >= Double(star) - 0.25 { return "star.fill" }
        if rating >= Double(star) - 0.75 { return "star.leadinghalf.filled" }
        return "star"
    }
}

/// Picks 1 to 5 stars. VoiceOver reads it as one adjustable control.
struct StarRatingPicker: View {
    @Binding var rating: Int

    var body: some View {
        HStack(spacing: 0) {
            ForEach(1...5, id: \.self) { star in
                Button {
                    rating = star
                } label: {
                    Image(systemName: star <= rating ? "star.fill" : "star")
                        .font(.title)
                        .foregroundStyle(star <= rating ? Color.orange : Color.secondary)
                        .frame(minWidth: 48, minHeight: 48)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .sensoryFeedback(.selection, trigger: rating)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your rating")
        .accessibilityValue(rating == 0 ? "Not rated" : "\(CommunityText.count(rating, "star")) out of 5")
        .accessibilityHint("Swipe up or down to change the rating.")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: rating = min(5, rating + 1)
            case .decrement: rating = max(1, rating - 1)
            @unknown default: break
            }
        }
        .accessibilityIdentifier("starRating")
    }
}
