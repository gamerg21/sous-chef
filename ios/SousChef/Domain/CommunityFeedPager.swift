import Foundation
import Observation

/// Loads a community feed page by page for a list or grid. It drops
/// duplicates, hides what `CommunityModeration` hides (hidden recipes,
/// blocked cooks, the on-device word filter), and makes sure a refresh and
/// "load more" never overlap or repeat a request.
///
///     @State private var pager = CommunityFeedPager(client: client, source: .feed(query))
///     …
///     ForEach(pager.listings) { listing in
///         Row(listing).task { await pager.loadMoreIfNeeded(after: listing) }
///     }
///     .task { await pager.loadFirstPage() }
///     .refreshable { await pager.refresh() }
@Observable
final class CommunityFeedPager {
    enum Source: Hashable {
        case feed(Community.FeedQuery)
        /// Recipes from followed cooks. Needs an account.
        case following
        /// "Cook from your pantry": one page, best match first.
        case pantry(Community.FeedQuery)
        /// The cook's own recipes; moderation doesn't apply to them.
        case mine
    }

    typealias Fetch = (_ cursor: String?) async throws -> Community.Page<Community.Listing>

    /// A page of nothing but hidden recipes is followed by the next one, up to this many in a row.
    static let maxPagesPerLoad = 5

    /// Everything loaded so far, without duplicates, before moderation.
    private(set) var loaded: [Community.Listing] = []
    /// True while the first page, a refresh or another page is loading.
    private(set) var isLoading = false
    /// True while a page after the first is loading.
    private(set) var isLoadingMore = false
    /// True once a load finished, with or without an error.
    private(set) var hasLoaded = false
    /// The last load's error; cleared by the next one that works.
    private(set) var error: (any Error)?
    private(set) var nextCursor: String?
    /// The last load went through `maxPagesPerLoad` pages of nothing but hidden
    /// recipes and there are more: no new row will appear to ask for them, so
    /// screens offer "Load more" (`loadMore()`).
    private(set) var isStalled = false

    @ObservationIgnored private let moderation: CommunityModeration?
    @ObservationIgnored private let fetch: Fetch
    @ObservationIgnored private var seen = Set<String>()
    /// Bumped by each refresh, so an answer that arrives late is dropped.
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var task: Task<Void, Never>?

    /// - Parameter moderation: Pass nil to show everything, as for the cook's own recipes.
    init(moderation: CommunityModeration?, fetch: @escaping Fetch) {
        self.moderation = moderation
        self.fetch = fetch
    }

    convenience init(client: CommunityClient, source: Source) {
        self.init(moderation: source == .mine ? nil : client.moderation) { cursor in
            switch source {
            case .feed(let query): try await client.feed(query, cursor: cursor)
            case .following: try await client.followingFeed(cursor: cursor)
            case .pantry(let query): try await client.pantryFeed(query)
            case .mine: try await client.myRecipes(cursor: cursor)
            }
        }
    }

    /// What to show. Follows moderation changes right away: hiding a recipe or blocking a cook removes it.
    var listings: [Community.Listing] { moderation?.visible(loaded) ?? loaded }

    var hasMore: Bool { nextCursor != nil }

    /// The error's message, for when there is nothing else to show.
    var errorMessage: String? { error?.localizedDescription }

    /// Loads the first page unless something is loaded or loading already.
    func loadFirstPage() async {
        if let task { return await task.value }
        guard !hasLoaded else { return }
        await refresh()
    }

    /// Starts over from the first page. What's on screen stays until the new
    /// page arrives; a load in flight is cancelled and its answer ignored.
    func refresh() async {
        generation += 1
        task?.cancel()
        let generation = generation
        let task = Task { await self.load(from: nil, generation: generation) }
        self.task = task
        await task.value
    }

    /// Loads the next page. Does nothing while another load runs or at the end.
    func loadMore() async {
        guard task == nil, hasLoaded, let cursor = nextCursor else { return }
        let generation = generation
        let task = Task { await self.load(from: cursor, generation: generation) }
        self.task = task
        await task.value
    }

    /// Call as each row appears: loads the next page when it's the last one.
    func loadMoreIfNeeded(after listing: Community.Listing) async {
        guard listing.id == listings.last?.id else { return }
        await loadMore()
    }

    /// Changes a loaded recipe in place, such as its like count after a like.
    func update(id: String, _ change: (inout Community.Listing) -> Void) {
        guard let index = loaded.firstIndex(where: { $0.id == id }) else { return }
        change(&loaded[index])
    }

    func remove(id: String) {
        loaded.removeAll { $0.id == id }
    }

    private func load(from start: String?, generation: Int) async {
        isLoading = true
        isLoadingMore = start != nil
        var cursor = start
        var replacing = start == nil
        do {
            var grew = false
            for _ in 0..<Self.maxPagesPerLoad {
                let page = try await fetch(cursor)
                // A refresh started meanwhile owns the state now.
                guard generation == self.generation else { return }
                let shown = replacing ? 0 : listings.count
                if replacing {
                    loaded = []
                    seen = []
                    replacing = false
                }
                loaded += page.items.filter { seen.insert($0.id).inserted }
                nextCursor = page.cursor
                cursor = page.cursor
                grew = listings.count > shown
                if cursor == nil || grew { break }
            }
            isStalled = nextCursor != nil && !grew
            error = nil
        } catch {
            guard generation == self.generation else { return }
            if !(error is CancellationError) { self.error = error }
        }
        hasLoaded = true
        isLoading = false
        isLoadingMore = false
        task = nil
    }
}
