import SwiftUI

/// Everything the person published, with where each recipe stands: public,
/// unlisted, not shared, under review or removed by a moderator.
struct MySharedRecipesView: View {
    @Environment(CommunityClient.self) private var client
    @State private var pager: CommunityFeedPager?

    var body: some View {
        List {
            if let pager {
                ForEach(pager.listings) { listing in
                    MySharedRecipeRow(listing: listing)
                        .task { await pager.loadMoreIfNeeded(after: listing) }
                }
                if pager.isLoadingMore {
                    ProgressView().frame(maxWidth: .infinity)
                }
                if let message = pager.errorMessage, !pager.listings.isEmpty {
                    ErrorBanner(message: message).listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
            }
        }
        .overlay {
            if let pager, pager.listings.isEmpty {
                if let error = pager.error {
                    CommunityFeedError(error: error) { Task { await pager.refresh() } }
                } else if pager.hasLoaded, !pager.isLoading {
                    ContentUnavailableView("Nothing shared yet", systemImage: "book.pages",
                                           description: Text("Open one of your recipes and choose Publish to community from its menu."))
                } else {
                    ProgressView()
                }
            }
        }
        .navigationTitle("My shared recipes")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await pager?.refresh() }
        .task {
            let pager = pager ?? CommunityFeedPager(client: client, source: .mine)
            self.pager = pager
            await pager.loadFirstPage()
        }
    }
}

struct MySharedRecipeRow: View {
    let listing: Community.Listing
    @ScaledMetric(relativeTo: .body) private var thumbnail: CGFloat = 56

    private var status: CommunityShareStatus { CommunityShareStatus(listing) }

    private var tint: Color {
        switch status {
        case .removed: .red
        case .underReview: .orange
        case .isPublic: .brand
        case .unlisted, .notShared: .secondary
        }
    }

    private var explanation: String? {
        switch status {
        case .removed: "A moderator removed this recipe because it broke the community guidelines."
        case .underReview: "This recipe was reported and is hidden while moderators look at it."
        case .unlisted: "Only people with the link can open it."
        case .notShared: "It isn't in the community any more."
        case .isPublic: nil
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            CommunityPhoto(source: listing.photoUrl, maxPixel: 300)
                .frame(width: min(thumbnail, 96), height: min(thumbnail, 96))
                .clipShape(.rect(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 4) {
                Text(listing.title).font(.headline)
                // Not a Label: a list gives labels a wide icon column.
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Image(systemName: status.systemImage).imageScale(.small)
                    Text(status.title)
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(tint)
                if let explanation {
                    Text(explanation).font(.footnote).foregroundStyle(.secondary)
                }
                if status.isVisible {
                    Text([CommunityText.count(listing.likeCount, "like"), CommunityText.count(listing.saveCount, "save"),
                          "made \(CommunityText.count(listing.madeCount, "time"))"].joined(separator: " · "))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let share = listing.shareUrl.flatMap(URL.init(string:)) {
                        ShareLink(item: share, subject: Text(listing.title)) { Label("Share link", systemImage: "square.and.arrow.up") }
                            .font(.subheadline)
                            .buttonStyle(.borderless)
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("mySharedRecipe")
    }
}
