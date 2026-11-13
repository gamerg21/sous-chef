import Foundation
import Observation

/// What the Community tab shows: which feed, tag and search, and the pager
/// that loads it. Changing any of them starts a fresh pager.
@Observable
final class CommunityFeedModel {
    enum Feed: String, CaseIterable, Identifiable {
        case new, trending, top, pantry, following

        var id: String { rawValue }

        var title: String {
            switch self {
            case .new: "New"
            case .trending: "Trending"
            case .top: "Top"
            case .pantry: "From your pantry"
            case .following: "Following"
            }
        }

        var systemImage: String {
            switch self {
            case .new: "sparkles"
            case .trending: "flame"
            case .top: "heart"
            case .pantry: "cabinet"
            case .following: "person.2"
            }
        }
    }

    let client: CommunityClient
    let social: CommunitySocial

    private(set) var feed = Feed.new
    private(set) var tag: String?
    /// What the search field holds; `submitSearch` makes it the feed.
    var search = ""
    /// The search the pager is showing.
    private(set) var activeSearch = ""
    private(set) var pager: CommunityFeedPager
    private(set) var tags: [Community.TagCount] = []

    @ObservationIgnored private var loadedIdentity: String?
    @ObservationIgnored private var tagsLoaded = false

    init(client: CommunityClient = .shared, social: CommunitySocial = .shared) {
        self.client = client
        self.social = social
        pager = CommunityFeedPager(client: client, source: .feed(Community.FeedQuery()))
    }

    var isSearching: Bool { !activeSearch.isEmpty }

    /// The feeds this community can show. One from before API v2 only lists and searches.
    var feeds: [Feed] {
        client.capabilities.level == .legacy ? [] : Feed.allCases
    }

    /// Tags narrow every feed except the followed cooks' and a search.
    var showsTags: Bool { !isSearching && feed != .following && !tags.isEmpty }

    /// Search wins over everything, as it does in the community service.
    var source: CommunityFeedPager.Source {
        var query = Community.FeedQuery()
        if isSearching {
            query.search = activeSearch
            return .feed(query)
        }
        query.tag = tag
        switch feed {
        case .new: query.sort = .new
        case .trending: query.sort = .hot
        case .top: query.sort = .top
        case .pantry: return .pantry(query)
        case .following: return .following
        }
        return .feed(query)
    }

    /// Identifies what's on screen, so the view reloads when it changes.
    var loadKey: String {
        "\(source.hashValue)|\(social.identity)"
    }

    func select(_ feed: Feed) {
        guard feed != self.feed else { return }
        self.feed = feed
        rebuild()
    }

    /// Selecting the current tag again clears it.
    func select(tag: String?) {
        let wanted = tag == self.tag ? nil : tag
        guard wanted != self.tag else { return }
        self.tag = wanted
        rebuild()
    }

    func submitSearch(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != activeSearch else { return }
        activeSearch = trimmed
        rebuild()
    }

    private func rebuild() {
        pager = CommunityFeedPager(client: client, source: source)
    }

    /// Whether the followed cooks' feed is waiting for an account.
    var needsAccount: CommunitySocial.AccountPrompt? {
        guard feed == .following, !isSearching else { return nil }
        if let prompt = social.accountPrompt { return prompt }
        return pager.error.flatMap(CommunitySocial.prompt(for:))
    }

    /// Loads the first page of what's selected, and the tags once.
    func load() async {
        if client.mode == .companion, social.status == nil { await social.refreshStatus() }
        let identity = social.identity
        if let loadedIdentity, loadedIdentity != identity {
            // Signed in, out, or to another server or kitchen: likes, saved copies and the feeds changed.
            social.reset()
            rebuild()
        }
        loadedIdentity = identity
        guard feed != .following || isSearching || social.accountPrompt == nil else { return }
        let pager = pager
        await pager.loadFirstPage()
        if client.capabilities.level == .legacy, feed != .new || tag != nil {
            // This community turned out to have no feeds or tags to choose from,
            // so there'd be no way back from the one selected.
            feed = .new
            tag = nil
            tags = []
            rebuild()
            return await load()
        }
        social.reconcile(pager.loaded)
        await loadTags()
    }

    func refresh() async {
        if client.mode == .companion { await social.refreshStatus() }
        guard feed != .following || isSearching || social.accountPrompt == nil else { return }
        let pager = pager
        await pager.refresh()
        social.reconcile(pager.loaded)
        if pager.error == nil { social.reconcileSaved(pager.loaded) }
        tagsLoaded = false
        await loadTags()
    }

    private func loadTags() async {
        guard !tagsLoaded, client.capabilities.browsing else { return }
        guard let loaded = try? await client.tags() else { return }
        tagsLoaded = true
        if loaded != tags { tags = loaded }
        // A tag that fell out of the list stays selectable while it's selected.
        if let tag, !tags.contains(where: { $0.tag.caseInsensitiveCompare(tag) == .orderedSame }) {
            tags.insert(Community.TagCount(tag: tag, count: 0), at: 0)
        }
    }
}
