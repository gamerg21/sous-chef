import SwiftUI

/// The feed: updates banner, feed and tag filters, then the recipes or the
/// state that explains why there are none.
struct CommunityFeedView: View {
    @Bindable var model: CommunityFeedModel
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityClient.self) private var client
    @Environment(CommunitySocial.self) private var social
    @State private var reporting: CommunityReportTarget?
    @State private var blocking: Community.Author?

    var body: some View {
        let pager = model.pager
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !client.pendingUpdates.isEmpty, !model.isSearching {
                    CommunityUpdatesBanner(count: client.pendingUpdates.count)
                        .padding(.horizontal)
                }
                if !model.isSearching, !model.feeds.isEmpty {
                    CommunityFeedPicker(model: model)
                }
                if model.showsTags {
                    CommunityTagPicker(model: model)
                }
                VStack(alignment: .leading, spacing: 14) {
                    if let prompt = model.needsAccount {
                        CommunityFollowingSignedOut(prompt: prompt)
                    } else if pager.listings.isEmpty {
                        if let error = pager.error {
                            CommunityFeedError(error: error) { Task { await model.refresh() } }
                        } else if pager.hasLoaded, !pager.isLoading {
                            if pager.hasMore {
                                CommunityFeedHiddenSoFar(pager: pager)
                            } else {
                                CommunityFeedEmpty(model: model)
                            }
                        } else {
                            CommunityGridSkeleton()
                        }
                    } else {
                        // A refresh failed; what was loaded stays.
                        if let message = pager.errorMessage, !pager.hasMore {
                            ErrorBanner(message: message)
                        }
                        CommunityGrid(pager: pager, showsPantry: model.feed == .pantry && !model.isSearching) { listing in
                            CommunityRecipeMenuItems(listing: listing,
                                                     report: { reporting = CommunityReportTarget(listing: listing) },
                                                     block: { blocking = listing.author })
                        }
                    }
                }
                .padding(.horizontal)
            }
            .padding(.vertical)
            // Never wider than the screen, whatever a row asks for.
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        }
        .refreshable { await model.refresh() }
        .task(id: model.loadKey) { await model.load() }
        .task(id: model.search) {
            // Searches as the person types, once they pause; clearing the field goes back at once.
            if !model.search.isEmpty { try? await Task.sleep(for: .milliseconds(450)) }
            if !Task.isCancelled { model.submitSearch(model.search) }
        }
        .sheet(item: $reporting) { CommunityReportSheet(target: $0).kitchenEnvironment(kitchen) }
        .blockCookConfirmation(for: $blocking)
        .accessibilityIdentifier("communityFeed")
    }
}

/// New, Trending, Top, From your pantry, Following.
struct CommunityFeedPicker: View {
    let model: CommunityFeedModel

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(model.feeds) { feed in
                    CommunityFilterChip(title: feed.title, systemImage: feed.systemImage, selected: model.feed == feed) {
                        model.select(feed)
                    }
                    .accessibilityIdentifier("communityFeed-\(feed.rawValue)")
                }
            }
            .padding(.horizontal)
        }
        .scrollIndicators(.hidden)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Feed")
    }
}

struct CommunityTagPicker: View {
    let model: CommunityFeedModel

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(model.tags) { entry in
                    let selected = model.tag?.caseInsensitiveCompare(entry.tag) == .orderedSame
                    Button {
                        model.select(tag: selected ? nil : entry.tag)
                    } label: {
                        Chip(text: entry.tag, systemImage: "number", tint: selected ? .brand : .secondary, selected: selected)
                            .frame(minHeight: 44)
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Tag \(entry.tag)")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("communityTag-\(entry.tag)")
                }
            }
            .padding(.horizontal)
        }
        .scrollIndicators(.hidden)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tags")
    }
}

/// Following, without an account to follow with.
struct CommunityFollowingSignedOut: View {
    let prompt: CommunitySocial.AccountPrompt
    @Environment(CommunitySocial.self) private var social

    var body: some View {
        ContentUnavailableView {
            Label("Follow your favorite cooks", systemImage: "person.2")
        } description: {
            Text(prompt == .signIn
                 ? "Sign in to follow cooks and see their newest recipes here."
                 : "Connect your community account on your Sous Chef server's web app (Community → Connect) to follow cooks and see their recipes here.")
        } actions: {
            if prompt == .signIn {
                Button("Sign in") { social.prompt = .signIn }
                    .buttonStyle(.glassProminent)
                    .accessibilityIdentifier("communityFollowingSignIn")
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// Nothing loaded, and why: offline, or the community's own answer.
struct CommunityFeedError: View {
    let error: any Error
    let retry: () -> Void

    private var offline: Bool { (error as? CommunityError) == .unavailable }

    var body: some View {
        ContentUnavailableView {
            Label(offline ? "Can't reach the community" : "Community unavailable", systemImage: offline ? "wifi.slash" : "exclamationmark.triangle")
        } description: {
            Text(offline ? "Check your internet connection and try again. Your own recipes work offline." : error.localizedDescription)
        } actions: {
            Button("Try again", systemImage: "arrow.clockwise", action: retry)
                .buttonStyle(.glassProminent)
                .accessibilityIdentifier("communityRetry")
        }
        .frame(maxWidth: .infinity)
    }
}

/// Every recipe loaded so far is hidden for this person, and the feed goes on.
struct CommunityFeedHiddenSoFar: View {
    let pager: CommunityFeedPager

    var body: some View {
        ContentUnavailableView {
            Label("Nothing to show yet", systemImage: "eye.slash")
        } description: {
            Text("The recipes loaded so far are hidden for you. There are more to look through.")
        } actions: {
            CommunityLoadMoreButton(pager: pager)
        }
        .frame(maxWidth: .infinity)
    }
}

/// The feed loaded and has nothing to show.
struct CommunityFeedEmpty: View {
    let model: CommunityFeedModel

    var body: some View {
        Group {
            if model.isSearching {
                ContentUnavailableView.search(text: model.activeSearch)
            } else if model.feed == .following {
                ContentUnavailableView("No recipes from cooks you follow", systemImage: "person.2",
                                       description: Text("Open a recipe and follow its cook. Their new recipes show up here."))
            } else if let tag = model.tag {
                ContentUnavailableView {
                    Label("Nothing tagged \(tag)", systemImage: "number")
                } actions: {
                    Button("Show all recipes") { model.select(tag: nil) }.buttonStyle(.glass)
                }
            } else {
                ContentUnavailableView("No recipes yet", systemImage: "book.pages",
                                       description: Text("Be the first to publish a recipe from its page."))
            }
        }
        .frame(maxWidth: .infinity)
    }
}
