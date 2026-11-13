import Foundation
import Observation
import SwiftData

/// One community recipe's page: the recipe, its tips, and what the person does with it.
@Observable
final class CommunityRecipeModel {
    enum Phase: Equatable {
        case loading, loaded, notFound
        case failed(String)
    }

    /// Tips shown before "Show more".
    static let collapsedTips = 3

    let id: String
    let client: CommunityClient
    let social: CommunitySocial

    private(set) var phase = Phase.loading
    private(set) var detail: Community.Detail?
    /// The listing the page was opened from, shown while the recipe loads.
    private(set) var preview: Community.Listing?

    /// Tips beyond the newest that came with the recipe.
    private(set) var moreTips: [Community.Tip] = []
    private(set) var tipsExpanded = false
    private(set) var loadingTips = false
    @ObservationIgnored private var tipsCursor: String?
    @ObservationIgnored private var tipsFetched = false
    @ObservationIgnored private var tipsExhausted = false

    private(set) var saving = false
    /// The copy in the person's recipes, while there is one on this device.
    var savedRecipe: Recipe? {
        // Deleted since: the community recipe can be saved again.
        copy.flatMap { $0.modelContext == nil || $0.isDeleted ? nil : $0 }
    }
    private var copy: Recipe?
    @ObservationIgnored private var loadedIdentity: String?
    /// The server kitchen what's shown was read for.
    @ObservationIgnored private var household: String?

    init(id: String, preview: Community.Listing?, client: CommunityClient = .shared, social: CommunitySocial = .shared) {
        self.id = id
        self.preview = preview
        self.client = client
        self.social = social
        household = client.householdID
    }

    /// The listing to show: the loaded one, or the one the page was opened from.
    var listing: Community.Listing? { detail?.listing ?? preview }

    var isOwn: Bool {
        if detail?.viewer?.own == true { return true }
        guard let author = listing?.author.id, !author.isEmpty else { return false }
        return author == social.myID
    }

    var isSaved: Bool { savedRecipe != nil || listing.map(social.isSaved) == true }

    // MARK: Loading

    func load() async {
        let identity = social.identity
        // Signing in changes what the page knows about the viewer.
        let silently = detail != nil
        if !silently { phase = .loading }
        if client.householdID != household {
            // Another kitchen: the saved copy and pantry match were the previous one's.
            household = client.householdID
            copy = nil
            detail?.listing.saved = nil
            detail?.listing.pantry = nil
            detail?.savedRecipeId = nil
            preview?.saved = nil
            preview?.pantry = nil
        }
        do {
            if !client.capabilities.isKnown { try? await client.resolveCapabilities() }
            var loaded = try await client.detail(id: id)
            if let viewer = loaded.viewer { loaded.listing.liked = viewer.liked }
            detail = loaded
            loadedIdentity = identity
            social.reconcile([loaded.listing])
            social.reconcileSaved([loaded.listing])
            copy = findSavedRecipe(loaded)
            phase = .loaded
        } catch is CancellationError {
            return
        } catch CommunityError.notFound {
            if !silently { phase = .notFound }
        } catch {
            if !silently { phase = .failed(error.localizedDescription) }
        }
    }

    private func findSavedRecipe(_ detail: Community.Detail) -> Recipe? {
        if client.mode == .direct { return client.savedRecipe(forRemoteID: id) }
        guard let saved = detail.savedRecipeId?.nilIfEmpty else { return nil }
        return client.kitchen.fetch(Recipe.self).first { $0.serverID == saved }
    }

    // MARK: Saving

    /// Saves a copy to the person's recipes. Throws `CommunityError`.
    func save() async throws {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        let result = try await client.save(recipeID: id)
        copy = result.recipe
        social.markSaved(id)
        #if DEBUG
        await CommunityTestSession.makeStaleIfRequested(result.recipe, client: client)
        #endif
        if let count = result.saveCount { detail?.listing.saveCount = count }
        detail?.listing.saved = true
    }

    // MARK: Follow

    var follow: CommunitySocial.FollowState? {
        guard let author = listing?.author, !author.id.isEmpty else { return nil }
        return social.follow(for: author.id, following: detail?.viewer?.following ?? false)
    }

    // MARK: "I made this"

    var made: Community.Detail.Viewer.Made? { detail?.viewer?.made }

    /// Posts or replaces the person's rating and tip. Throws `CommunityError`.
    func submitMade(rating: Int, tip: String?) async throws {
        let result = try await client.made(recipeID: id, rating: rating, tip: tip?.nilIfEmpty)
        apply(result)
        if detail?.viewer == nil { detail?.viewer = .init(liked: listing?.liked ?? false, following: follow?.following ?? false, own: false, made: nil) }
        detail?.viewer?.made = .init(rating: rating, tip: tip?.nilIfEmpty)
        await reloadTips()
    }

    /// Throws `CommunityError`.
    func removeMade() async throws {
        let result = try await client.removeMade(recipeID: id)
        apply(result)
        detail?.viewer?.made = nil
        await reloadTips()
    }

    private func apply(_ result: Community.MadeResult) {
        detail?.listing.madeCount = result.madeCount
        detail?.listing.rating = result.rating
    }

    // MARK: Tips

    /// Every tip loaded so far that the person may see, newest first.
    var allTips: [Community.Tip] {
        var seen = Set<String>()
        let loaded = ((detail?.tips ?? []) + moreTips).filter { tip in
            tip.tip?.nilIfEmpty != nil && seen.insert(tip.id).inserted
        }
        return client.moderation.visible(loaded)
    }

    var tips: [Community.Tip] {
        tipsExpanded ? allTips : Array(allTips.prefix(Self.collapsedTips))
    }

    /// Whether "Show more" has anything to show: tips held back, or more in the community.
    var hasMoreTips: Bool {
        if !tipsExpanded { return allTips.count > Self.collapsedTips || mayHaveMoreTips }
        return mayHaveMoreTips
    }

    /// A recipe's page carries its newest 20 tips; a full set means there may be more.
    private var mayHaveMoreTips: Bool {
        guard client.capabilities.social, !tipsExhausted else { return false }
        return tipsFetched ? tipsCursor != nil : (detail?.tips.count ?? 0) >= 20
    }

    func showMoreTips() async {
        guard !loadingTips else { return }
        if !tipsExpanded {
            tipsExpanded = true
            // The held-back tips were enough for this tap.
            if allTips.count > Self.collapsedTips { return }
        }
        guard mayHaveMoreTips else { return }
        loadingTips = true
        defer { loadingTips = false }
        do {
            let page = try await client.tips(recipeID: id, cursor: tipsFetched ? tipsCursor : nil, limit: 50)
            moreTips += page.items
            tipsCursor = page.cursor
            tipsFetched = true
        } catch {
            tipsExhausted = true
            social.report(error)
        }
    }

    /// Hides a tip the person reported, for good on this device.
    func markReported(_ tip: Community.Tip) {
        client.moderation.markReported(tipID: tip.id)
    }

    /// The person's own tip changed: read the recipe's tips again.
    private func reloadTips() async {
        guard let fresh = try? await client.detail(id: id) else { return }
        detail?.tips = fresh.tips
        detail?.listing.madeCount = fresh.madeCount
        detail?.listing.rating = fresh.rating
        moreTips = []
        tipsCursor = nil
        tipsFetched = false
        tipsExhausted = false
    }
}
