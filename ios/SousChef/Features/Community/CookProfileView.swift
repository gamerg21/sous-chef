import SwiftUI

/// A cook's public profile and what they've shared.
struct CookProfileView: View {
    let author: Community.Author
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityModeration.self) private var moderation
    @Environment(CommunityClient.self) private var client
    @Environment(CommunitySocial.self) private var social
    @State private var cook: Community.Cook?
    @State private var error: (any Error)?
    @State private var pager: CommunityFeedPager?
    /// Who and which kitchen `pager` was loaded for.
    @State private var pagerIdentity: String?
    @State private var blocking: Community.Author?
    @State private var reporting: CommunityReportTarget?

    private var name: String { cook?.name.nilIfEmpty ?? author.name.nilIfEmpty ?? "Community cook" }
    private var isOwn: Bool { cook?.viewer?.own == true || author.id == social.myID }
    private var blocked: Bool { moderation.isBlocked(author) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if blocked {
                    ContentUnavailableView {
                        Label("You blocked \(name)", systemImage: "hand.raised")
                    } description: {
                        Text("Their recipes and tips are hidden for you.")
                    } actions: {
                        Button("Unblock") { Task { try? await client.setBlocked(false, author: author) } }
                            .buttonStyle(.glass)
                            .accessibilityIdentifier("cookUnblock")
                    }
                    .frame(maxWidth: .infinity)
                } else if let cook {
                    CookProfileHeader(cook: cook, isOwn: isOwn)
                    Eyebrow(isOwn ? "Your recipes" : "Recipes", systemImage: "book.pages")
                    if let pager {
                        if pager.listings.isEmpty {
                            if let error = pager.error {
                                CommunityFeedError(error: error) { Task { await pager.refresh() } }
                            } else if pager.hasLoaded, !pager.isLoading, pager.hasMore {
                                CommunityLoadMoreButton(pager: pager)
                            } else if pager.hasLoaded, !pager.isLoading {
                                Text(isOwn ? "You haven't shared any public recipes yet." : "No public recipes yet.").foregroundStyle(.secondary)
                            } else {
                                CommunityGridSkeleton()
                            }
                        } else {
                            CommunityGrid(pager: pager) { listing in
                                CommunityRecipeMenuItems(listing: listing,
                                                         report: { reporting = CommunityReportTarget(listing: listing) },
                                                         block: { blocking = listing.author })
                            }
                        }
                    }
                } else if let error {
                    if (error as? CommunityError) == .notFound {
                        ContentUnavailableView("Cook not found", systemImage: "person.crop.circle.badge.questionmark",
                                               description: Text("This cook isn't in the community any more."))
                    } else {
                        CommunityFeedError(error: error) { Task { await load() } }
                    }
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                }
            }
            .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
            .padding()
        }
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !isOwn, !blocked {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Block \(name)", systemImage: "person.crop.circle.badge.xmark", role: .destructive) { blocking = cook?.author ?? author }
                            .tint(.red)
                    } label: {
                        Label("More", systemImage: "ellipsis")
                    }
                    .accessibilityIdentifier("cookMenu")
                }
            }
        }
        .refreshable { await load(refreshing: true) }
        .task(id: social.identity) { await load() }
        .sheet(item: $reporting) { CommunityReportSheet(target: $0).kitchenEnvironment(kitchen) }
        .blockCookConfirmation(for: $blocking)
        .accessibilityIdentifier("cookProfile")
    }

    private func load(refreshing: Bool = false) async {
        // Another account or kitchen: the saved marks loaded before were the previous one's.
        let identity = social.identity
        let pager = (pagerIdentity == identity ? pager : nil) ?? CommunityFeedPager(client: client, source: .feed(Community.FeedQuery(author: author.id)))
        self.pager = pager
        pagerIdentity = identity
        do {
            let loaded = try await client.cook(id: author.id)
            social.reconcile(loaded)
            cook = loaded
            error = nil
        } catch is CancellationError {
            return
        } catch {
            if cook == nil { self.error = error }
        }
        if refreshing { await pager.refresh() } else { await pager.loadFirstPage() }
        social.reconcile(pager.loaded)
    }
}

/// Name, bio, counts and the Follow button.
struct CookProfileHeader: View {
    let cook: Community.Cook
    let isOwn: Bool
    @Environment(CommunitySocial.self) private var social

    var body: some View {
        let follow = social.follow(for: cook.id, following: cook.viewer?.following ?? false, followers: cook.followerCount)
        Card {
            AdaptiveStack(spacing: 14, verticalSpacing: 10) {
                HStack(spacing: 14) {
                    IconBadge(systemImage: "person.fill", size: 56)
                        .accessibilityHidden(true)
                    Text(cook.name)
                        .font(.title2.bold())
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityIdentifier("cookName")
                }
                Spacer(minLength: 0)
                if !isOwn {
                    CommunityFollowButton(author: cook.author, state: follow)
                }
            }
            if let bio = cook.bio?.nilIfEmpty {
                Text(bio).fixedSize(horizontal: false, vertical: true)
            }
            TileRow(count: 3, minimumTileWidth: 84, spacing: 10) {
                CookStat(value: cook.recipeCount, label: cook.recipeCount == 1 ? "Recipe" : "Recipes")
                CookStat(value: follow.followers ?? cook.followerCount, label: (follow.followers ?? cook.followerCount) == 1 ? "Follower" : "Followers")
                    .accessibilityIdentifier("cookFollowers")
                CookStat(value: cook.followingCount, label: "Following")
            }
        }
    }
}

struct CookStat: View {
    let value: Int
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value, format: .number.notation(.compactName))
                .font(.title3.bold().monospacedDigit())
                .contentTransition(.numericText(value: Double(value)))
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value.formatted()) \(label)")
    }
}
