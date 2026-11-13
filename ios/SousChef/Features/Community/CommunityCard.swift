import SwiftUI

/// A recipe in a community grid: photo, title, cook, time, rating and likes.
/// The photo and text open the recipe; the heart likes it without leaving.
struct CommunityCard: View {
    let listing: Community.Listing
    /// "You have 5 of 7" and what's missing, for the pantry feed.
    var showsPantry = false
    @Environment(CommunityClient.self) private var client
    @Environment(CommunitySocial.self) private var social
    @ScaledMetric(relativeTo: .subheadline) private var photoHeight: CGFloat = 120

    private var isSocial: Bool { client.capabilities.social }
    private var pantry: Community.PantryMatch? { showsPantry ? listing.pantry : nil }

    var body: some View {
        let saved = social.isSaved(listing)
        VStack(alignment: .leading, spacing: 0) {
            NavigationLink(value: CommunityRoute.recipe(listing)) {
                VStack(alignment: .leading, spacing: 0) {
                    CommunityPhoto(source: listing.photoUrl)
                        .frame(height: min(photoHeight, 200))
                        .frame(maxWidth: .infinity)
                        .overlay(alignment: .topTrailing) {
                            if saved {
                                Label("Saved", systemImage: "bookmark.fill")
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .glassEffect(.regular, in: .capsule)
                                    .padding(8)
                            }
                        }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(listing.title)
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(2, reservesSpace: true)
                            .multilineTextAlignment(.leading)
                        if let author = listing.author.name.nilIfEmpty {
                            Label(author, systemImage: "person.crop.circle")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                        if let pantry, pantry.total > 0 { CommunityPantryLine(match: pantry) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding([.horizontal, .top], 10)
                    .padding(.bottom, isSocial ? 0 : 10)
                }
                .contentShape(.rect)
                // One element: VoiceOver reads the card's facts with its title.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(CommunityText.summary(of: listing, social: isSocial, saved: saved, pantry: pantry))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("communityCard")
            if isSocial {
                HStack(spacing: 8) {
                    CommunityCardFacts(listing: listing)
                    Spacer(minLength: 0)
                    CommunityLikeButton(listing: listing)
                }
                .padding(.leading, 10)
                .padding(.trailing, 4)
            } else if let minutes = listing.totalTimeMinutes, minutes > 0 {
                CommunityCardFacts(listing: listing)
                    .padding([.horizontal, .bottom], 10)
            }
        }
        .background(.background.secondary)
        .clipShape(.rect(cornerRadius: 20))
    }
}

/// Time and average rating under a card's title. VoiceOver reads them with the card.
struct CommunityCardFacts: View {
    let listing: Community.Listing
    @Environment(CommunityClient.self) private var client

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { facts }
            VStack(alignment: .leading, spacing: 2) { facts }
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(.secondary)
    }

    @ViewBuilder private var facts: some View {
        if let minutes = listing.totalTimeMinutes, minutes > 0 {
            Label(CommunityText.time(minutes: minutes), systemImage: "timer").lineLimit(1).accessibilityHidden(true)
        }
        if client.capabilities.social, let rating = listing.rating {
            Label {
                Text(CommunityText.rating(rating))
            } icon: {
                Image(systemName: "star.fill").foregroundStyle(.orange)
            }
            .lineLimit(1)
            .accessibilityHidden(true)
        }
    }
}

/// "You have 5 of 7" and what's missing.
struct CommunityPantryLine: View {
    let match: Community.PantryMatch

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(CommunityText.pantry(match), systemImage: match.isReady ? "checkmark.circle.fill" : "cabinet")
                .font(.caption.weight(.semibold))
                .foregroundStyle(match.isReady ? Color.brand : Color.primary)
            if let missing = CommunityText.missing(match) {
                Text(missing)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
        }
        .padding(.top, 2)
    }
}

/// A grid of recipe cards that loads the next page as the last card appears.
struct CommunityGrid<Menu: View>: View {
    let pager: CommunityFeedPager
    var showsPantry = false
    @ViewBuilder var menu: (Community.Listing) -> Menu
    /// Cards get fewer columns as text grows, so titles keep room.
    @ScaledMetric(relativeTo: .subheadline) private var cardWidth: CGFloat = 160

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: cardWidth), spacing: 14, alignment: .top)], spacing: 14) {
            ForEach(pager.listings) { listing in
                CommunityCard(listing: listing, showsPantry: showsPantry)
                    .contextMenu { menu(listing) }
                    .task { await pager.loadMoreIfNeeded(after: listing) }
            }
        }
        if pager.isLoadingMore {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 44)
                .accessibilityLabel("Loading more recipes")
                .accessibilityIdentifier("communityLoadingMore")
        } else if pager.hasMore, pager.error != nil {
            // The next page failed; the cards above stay.
            Button("Couldn't load more. Try again", systemImage: "arrow.clockwise") {
                Task { await pager.loadMore() }
            }
            .buttonStyle(.glass)
            .frame(maxWidth: .infinity, minHeight: 44)
        } else if pager.isStalled {
            // The pages that followed were all hidden, so no new card asks for the next.
            CommunityLoadMoreButton(pager: pager)
        }
    }
}

/// Goes on through a feed whose last pages had nothing to show.
struct CommunityLoadMoreButton: View {
    let pager: CommunityFeedPager

    var body: some View {
        Button("Load more", systemImage: "arrow.down.circle") {
            Task { await pager.loadMore() }
        }
        .buttonStyle(.glass)
        .frame(maxWidth: .infinity, minHeight: 44)
        .accessibilityIdentifier("communityLoadMore")
    }
}

/// Greyed-out cards while the first page loads.
struct CommunityGridSkeleton: View {
    @ScaledMetric(relativeTo: .subheadline) private var cardWidth: CGFloat = 160
    @ScaledMetric(relativeTo: .subheadline) private var photoHeight: CGFloat = 120

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: cardWidth), spacing: 14, alignment: .top)], spacing: 14) {
            ForEach(0..<6, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 0) {
                    Rectangle().fill(.fill.tertiary).frame(height: min(photoHeight, 200))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("A community recipe title").font(.subheadline.weight(.semibold)).lineLimit(2, reservesSpace: true)
                        Text("Cook's name").font(.caption)
                        Text("20 min").font(.caption).frame(minHeight: 44)
                    }
                    .redacted(reason: .placeholder)
                    .padding([.horizontal, .top], 10)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.background.secondary)
                .clipShape(.rect(cornerRadius: 20))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading community recipes")
        .accessibilityIdentifier("communitySkeleton")
    }
}
