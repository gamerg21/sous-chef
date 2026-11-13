import Foundation

/// Wire types of the community API v2 (`docs/COMMUNITY_API.md`,
/// `src/lib/community-contract.ts`). The same types decode the direct HTTP
/// responses and the companion server's `community:…` results, which add a
/// few optional fields (`saved`, `pantry`, `blocked`).
nonisolated enum Community {
    nonisolated struct Author: Codable, Hashable, Sendable {
        var id: String
        var name: String
    }

    /// How many of a recipe's ingredients the kitchen has in stock.
    nonisolated struct PantryMatch: Encodable, Hashable, Sendable {
        var have: Int
        var total: Int
        /// Ingredient names that aren't in stock.
        var missing: [String]

        /// Share of ingredients on hand, 0…1. A recipe without ingredients counts as 0.
        var share: Double { total > 0 ? Double(have) / Double(total) : 0 }
        var isReady: Bool { total > 0 && have >= total }
    }

    /// A recipe in a list: no steps, quantities or inline photo.
    nonisolated struct Listing: Identifiable, Hashable, Sendable {
        var id: String
        var revision: Int
        var createdAt: String
        var updatedAt: String
        var author: Author
        var title: String
        var description: String?
        var tags: [String]
        var servings: Double?
        var totalTimeMinutes: Double?
        /// An https URL, or an inline `data:` URL from a community without v2. Load it with `CommunityImageLoader`.
        var photoUrl: String?
        var ingredientNames: [String]
        var likeCount: Int
        var saveCount: Int
        var madeCount: Int
        /// Average "made it" rating, one decimal; nil without ratings.
        var rating: Double?
        var shareUrl: String?
        /// Only when signed in.
        var liked: Bool?
        /// Whether this kitchen already has a copy. From the server in companion mode, from the device otherwise.
        var saved: Bool?
        /// From the server in companion mode (`pantry: true`), computed on the device otherwise.
        var pantry: PantryMatch?
        /// Only on the cook's own recipes (`myRecipes`): `public`, `unlisted` or `private`.
        var visibility: String?
        var removed: Bool?
        var underReview: Bool?

        var created: Date? { Community.date(createdAt) }
        var updated: Date? { Community.date(updatedAt) }
    }

    nonisolated struct Tip: Identifiable, Hashable, Sendable {
        var id: String
        var author: Author
        var rating: Int
        var tip: String?
        var createdAt: String

        var created: Date? { Community.date(createdAt) }
    }

    /// The published recipe itself.
    nonisolated struct Snapshot: Hashable, Sendable {
        nonisolated struct Ingredient: Hashable, Sendable { var name: String; var quantity: Double?; var unit: String?; var note: String? }
        nonisolated struct Step: Decodable, Hashable, Sendable { var text: String }

        var title: String
        var description: String?
        var tags: [String]
        var servings: Double?
        var totalTimeMinutes: Double?
        var sourceUrl: String?
        /// Only when the detail was asked for with the photo inline.
        var photoDataUrl: String?
        var ingredients: [Ingredient]
        var steps: [Step]

        /// The inline photo's bytes, when there is one.
        var photoData: Data? { Community.dataURLBytes(photoDataUrl) }
    }

    /// A recipe's page: the listing's fields (readable directly, e.g.
    /// `detail.title`) plus the full recipe, tips and the viewer's state.
    @dynamicMemberLookup
    nonisolated struct Detail: Identifiable, Hashable, Sendable {
        nonisolated struct Viewer: Decodable, Hashable, Sendable {
            nonisolated struct Made: Hashable, Sendable { var rating: Int; var tip: String? }
            var liked: Bool
            var following: Bool
            var own: Bool
            var made: Made?
        }

        var listing: Listing
        /// `public` or `unlisted`.
        var visibility: String
        var snapshot: Snapshot
        /// The newest 20 tips that have text; `CommunityClient.tips` pages through the rest.
        var tips: [Tip]
        /// Only when signed in.
        var viewer: Viewer?
        /// Companion mode: the saved copy's recipe ID on the server (`Recipe.serverID`).
        /// Otherwise the saved recipe's UUID string.
        var savedRecipeId: String?

        var id: String { listing.id }

        subscript<Value>(dynamicMember keyPath: KeyPath<Listing, Value>) -> Value { listing[keyPath: keyPath] }
    }

    nonisolated struct Cook: Identifiable, Hashable, Sendable {
        nonisolated struct Viewer: Decodable, Hashable, Sendable { var following: Bool; var own: Bool }

        var id: String
        var name: String
        var bio: String?
        var recipeCount: Int
        var followerCount: Int
        var followingCount: Int
        /// Only when signed in.
        var viewer: Viewer?
        /// Companion mode only: the caller blocked this cook on the server.
        var blocked: Bool?

        var author: Author { Author(id: id, name: name) }
    }

    /// The signed-in cook.
    nonisolated struct Me: Identifiable, Hashable, Sendable {
        var cook: Cook
        var moderator: Bool

        var id: String { cook.id }
    }

    /// Whether the person can act in the community, and as whom.
    nonisolated struct AccountStatus: Hashable, Sendable {
        /// A community is set up (on the server in companion mode).
        var configured: Bool
        /// Signed in (direct) or the server has a community connection (companion).
        var connected: Bool
        var me: Me?
    }

    nonisolated enum Sort: String, CaseIterable, Identifiable, Sendable {
        case new, hot, top

        var id: String { rawValue }
        var title: String {
            switch self {
            case .new: "New"
            case .hot: "Trending"
            case .top: "Most liked"
            }
        }
    }

    /// What a feed shows. `search`, `author` and `tag` don't combine: the
    /// service takes the first one set, in that order, and search ignores `sort`.
    nonisolated struct FeedQuery: Hashable, Sendable {
        var sort: Sort = .new
        var tag: String?
        var search: String?
        /// A cook's ID.
        var author: String?
        /// 1–50.
        var limit: Int = 20
    }

    nonisolated struct Page<Item: Sendable>: Sendable {
        var items: [Item]
        /// Pass back for the next page; nil at the end.
        var cursor: String?
    }

    nonisolated struct TagCount: Hashable, Identifiable, Sendable {
        var tag: String
        var count: Int

        var id: String { tag }
    }

    /// Raw values are the contract's; `title` is what people read.
    nonisolated enum ReportReason: String, CaseIterable, Identifiable, Codable, Sendable {
        case offensive, harassment, sexual, spam, dangerous, copyright, other

        var id: String { rawValue }
        var title: String {
            switch self {
            case .offensive: "Offensive or hateful"
            case .harassment: "Harassment"
            case .sexual: "Sexual content"
            case .spam: "Spam or scam"
            case .dangerous: "Dangerous or unsafe food advice"
            case .copyright: "Copyright"
            case .other: "Other"
            }
        }

        /// A reason a newer service adds reads as `other`.
        init(from decoder: Decoder) throws {
            self = Self(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .other
        }
    }

    nonisolated enum ReportStatus: String, CaseIterable, Identifiable, Sendable {
        case open, actioned, dismissed

        var id: String { rawValue }
    }

    nonisolated enum ModAction: String, CaseIterable, Identifiable, Sendable {
        case dismiss, removeRecipe = "remove_recipe", removeTip = "remove_tip", banUser = "ban_user"

        var id: String { rawValue }
    }

    /// A report as moderators see it.
    nonisolated struct Report: Decodable, Identifiable, Hashable, Sendable {
        nonisolated struct Recipe: Decodable, Hashable, Sendable {
            var id: String
            var title: String
            var author: Author
            var visibility: String
            var underReview: Bool
        }
        nonisolated struct ReportedTip: Decodable, Hashable, Sendable {
            var id: String
            var author: Author
            var rating: Int
            var tip: String?
        }

        var id: String
        /// `open`, `actioned` or `dismissed`.
        var status: String
        var createdAt: String
        var reason: ReportReason
        var note: String?
        /// Open reports on the same target.
        var reportCount: Int
        /// Nil when the recipe is gone.
        var recipe: Recipe?
        var tip: ReportedTip?
        var resolution: String?
        var resolvedAt: String?

        var created: Date? { Community.date(createdAt) }
    }

    nonisolated struct LikeResult: Hashable, Sendable { var liked: Bool; var likeCount: Int }
    nonisolated struct MadeResult: Hashable, Sendable { var madeCount: Int; var rating: Double? }
    nonisolated struct FollowResult: Hashable, Sendable { var following: Bool; var followerCount: Int }

    /// What reporting did.
    nonisolated enum ReportOutcome: Equatable, Sendable {
        /// The community has the report.
        case sent
        /// This community or server can't take reports in the app: send the
        /// existing email report (`CommunityReport.mailtoURL`) instead.
        case useEmail
    }

    /// A saved copy whose community recipe has a newer revision.
    nonisolated struct Update: Identifiable, Hashable, Sendable {
        /// The saved recipe: its UUID string, or in companion mode its ID on the server (`Recipe.serverID`).
        var recipeId: String
        var title: String
        var remoteId: String
        var savedRevision: Int
        var latestRevision: Int

        var id: String { recipeId }
    }

    /// What saving a community recipe did.
    nonisolated struct SaveResult {
        /// The new recipe. Nil in companion mode until the sync that follows brings it over.
        var recipe: SousChef.Recipe?
        /// The saved copy's ID on the server, in companion mode.
        var serverRecipeID: String?
        /// The recipe's new save count, when the community reported one.
        var saveCount: Int?
    }

    /// The longest note a report takes (`/api/v2/report`).
    static let reportNoteLimit = 500

    // MARK: Numbers from the community

    // A published recipe can carry any number (`servings: 1e100`), and so can a
    // community or server that isn't ours. Every number is checked once, where
    // it is decoded, so screens and saved copies only meet sane values.

    /// Servings, when finite and 1…100,000 once rounded; nil otherwise.
    static func servings(_ value: Double?) -> Double? { bounded(value, in: 1...100_000) }

    /// A time in minutes, when finite and 1…1,000,000 once rounded; nil otherwise.
    static func minutes(_ value: Double?) -> Double? { bounded(value, in: 1...1_000_000) }

    /// An ingredient quantity, when finite, not negative and at most a billion; nil otherwise.
    static func quantity(_ value: Double?) -> Double? { bounded(value, in: 0...1_000_000_000, rounding: false) }

    /// A counter or revision: never negative, 0 when missing or not a number.
    static func count(_ value: Double?) -> Int {
        guard let value, value.isFinite, value > 0 else { return 0 }
        return Int(min(value, 1_000_000_000_000).rounded())
    }

    /// An average rating, kept within 0…5; nil when missing or not a number.
    static func rating(_ value: Double?) -> Double? {
        guard let value, value.isFinite else { return nil }
        return min(5, max(0, value))
    }

    /// The nearest whole number, or nil for one an `Int` can't hold (`Int(_:)` would trap).
    static func whole(_ value: Double) -> Int? {
        value.isFinite ? Int(exactly: value.rounded()) : nil
    }

    private static func bounded(_ value: Double?, in range: ClosedRange<Double>, rounding: Bool = true) -> Double? {
        guard let value, value.isFinite, range.contains(rounding ? value.rounded() : value) else { return nil }
        return value
    }

    /// A "made it" rating: a whole number of stars, 0…5.
    static func stars(_ value: Double?) -> Int { min(5, count(value)) }

    // MARK: Helpers

    /// Parses the API's ISO 8601 times, with or without fractional seconds.
    static func date(_ text: String?) -> Date? {
        guard let text, !text.isEmpty else { return nil }
        return (try? Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
            ?? (try? Date(text, strategy: .iso8601))
    }

    /// The bytes of a base64 `data:` URL.
    static func dataURLBytes(_ url: String?) -> Data? {
        guard let url, url.hasPrefix("data:"), let comma = url.firstIndex(of: ",") else { return nil }
        return Data(base64Encoded: String(url[url.index(after: comma)...]))
    }
}

// Decoding is lenient about counters and lists a publication from before the
// v2 migration may lack. Defined in extensions so the memberwise initializers stay.

nonisolated extension Community.Listing: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, revision, createdAt, updatedAt, author, title, description, tags, servings, totalTimeMinutes, photoUrl, ingredientNames
        case likeCount, saveCount, madeCount, rating, shareUrl, liked, saved, pantry, visibility, removed, underReview
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        revision = Community.count(values.number(.revision))
        createdAt = try values.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        updatedAt = try values.decodeIfPresent(String.self, forKey: .updatedAt) ?? createdAt
        author = try values.decode(Community.Author.self, forKey: .author)
        title = try values.decode(String.self, forKey: .title)
        description = try values.decodeIfPresent(String.self, forKey: .description)
        tags = try values.decodeIfPresent([String].self, forKey: .tags) ?? []
        servings = Community.servings(values.number(.servings))
        totalTimeMinutes = Community.minutes(values.number(.totalTimeMinutes))
        photoUrl = try values.decodeIfPresent(String.self, forKey: .photoUrl)
        ingredientNames = try values.decodeIfPresent([String].self, forKey: .ingredientNames) ?? []
        likeCount = Community.count(values.number(.likeCount))
        saveCount = Community.count(values.number(.saveCount))
        madeCount = Community.count(values.number(.madeCount))
        rating = Community.rating(values.number(.rating))
        shareUrl = try values.decodeIfPresent(String.self, forKey: .shareUrl)
        liked = try values.decodeIfPresent(Bool.self, forKey: .liked)
        saved = try values.decodeIfPresent(Bool.self, forKey: .saved)
        pantry = try values.decodeIfPresent(Community.PantryMatch.self, forKey: .pantry)
        visibility = try values.decodeIfPresent(String.self, forKey: .visibility)
        removed = try values.decodeIfPresent(Bool.self, forKey: .removed)
        underReview = try values.decodeIfPresent(Bool.self, forKey: .underReview)
    }
}

nonisolated extension KeyedDecodingContainer {
    /// A number the community sent, or nil when it's missing or isn't one.
    func number(_ key: Key) -> Double? {
        (try? decodeIfPresent(Double.self, forKey: key)) ?? nil
    }
}

nonisolated extension Community.Snapshot.Ingredient: Decodable {
    private enum CodingKeys: String, CodingKey { case name, quantity, unit, note }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        name = try values.decode(String.self, forKey: .name)
        quantity = Community.quantity(values.number(.quantity))
        unit = try values.decodeIfPresent(String.self, forKey: .unit)
        note = try values.decodeIfPresent(String.self, forKey: .note)
    }
}

nonisolated extension Community.PantryMatch: Decodable {
    private enum CodingKeys: String, CodingKey { case have, total, missing }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        total = Community.count(values.number(.total))
        have = min(total, Community.count(values.number(.have)))
        missing = try values.decodeIfPresent([String].self, forKey: .missing) ?? []
    }
}

nonisolated extension Community.Tip: Decodable {
    private enum CodingKeys: String, CodingKey { case id, author, rating, tip, createdAt }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        author = try values.decode(Community.Author.self, forKey: .author)
        rating = Community.stars(values.number(.rating))
        tip = try values.decodeIfPresent(String.self, forKey: .tip)
        createdAt = try values.decode(String.self, forKey: .createdAt)
    }
}

nonisolated extension Community.Detail.Viewer.Made: Decodable {
    private enum CodingKeys: String, CodingKey { case rating, tip }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        rating = Community.stars(values.number(.rating))
        tip = try values.decodeIfPresent(String.self, forKey: .tip)
    }
}

nonisolated extension Community.TagCount: Decodable {
    private enum CodingKeys: String, CodingKey { case tag, count }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        tag = try values.decode(String.self, forKey: .tag)
        count = Community.count(values.number(.count))
    }
}

nonisolated extension Community.LikeResult: Decodable {
    private enum CodingKeys: String, CodingKey { case liked, likeCount }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        liked = try values.decode(Bool.self, forKey: .liked)
        likeCount = Community.count(values.number(.likeCount))
    }
}

nonisolated extension Community.MadeResult: Decodable {
    private enum CodingKeys: String, CodingKey { case madeCount, rating }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        madeCount = Community.count(values.number(.madeCount))
        rating = Community.rating(values.number(.rating))
    }
}

nonisolated extension Community.FollowResult: Decodable {
    private enum CodingKeys: String, CodingKey { case following, followerCount }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        following = try values.decode(Bool.self, forKey: .following)
        followerCount = Community.count(values.number(.followerCount))
    }
}

nonisolated extension Community.Update: Decodable {
    private enum CodingKeys: String, CodingKey { case recipeId, title, remoteId, savedRevision, latestRevision }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        recipeId = try values.decode(String.self, forKey: .recipeId)
        title = try values.decodeIfPresent(String.self, forKey: .title) ?? ""
        remoteId = try values.decode(String.self, forKey: .remoteId)
        savedRevision = Community.count(values.number(.savedRevision))
        latestRevision = Community.count(values.number(.latestRevision))
    }
}

nonisolated extension Community.Snapshot: Decodable {
    private enum CodingKeys: String, CodingKey {
        case title, description, tags, servings, totalTimeMinutes, sourceUrl, photoDataUrl, ingredients, steps
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        title = try values.decode(String.self, forKey: .title)
        description = try values.decodeIfPresent(String.self, forKey: .description)
        tags = try values.decodeIfPresent([String].self, forKey: .tags) ?? []
        servings = Community.servings(values.number(.servings))
        totalTimeMinutes = Community.minutes(values.number(.totalTimeMinutes))
        sourceUrl = try values.decodeIfPresent(String.self, forKey: .sourceUrl)
        photoDataUrl = try values.decodeIfPresent(String.self, forKey: .photoDataUrl)
        ingredients = try values.decodeIfPresent([Ingredient].self, forKey: .ingredients) ?? []
        steps = try values.decodeIfPresent([Step].self, forKey: .steps) ?? []
    }
}

nonisolated extension Community.Detail: Decodable {
    private enum CodingKeys: String, CodingKey {
        case visibility, snapshot, tips, viewer, savedRecipeId
    }

    init(from decoder: Decoder) throws {
        listing = try Community.Listing(from: decoder)
        let values = try decoder.container(keyedBy: CodingKeys.self)
        visibility = try values.decodeIfPresent(String.self, forKey: .visibility) ?? "public"
        snapshot = try values.decode(Community.Snapshot.self, forKey: .snapshot)
        tips = try values.decodeIfPresent([Community.Tip].self, forKey: .tips) ?? []
        viewer = try values.decodeIfPresent(Viewer.self, forKey: .viewer)
        savedRecipeId = try values.decodeIfPresent(String.self, forKey: .savedRecipeId)
        // The detail's own visibility isn't one of the "my recipes" states.
        listing.visibility = nil
    }
}

nonisolated extension Community.Cook: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, name, bio, recipeCount, followerCount, followingCount, viewer, blocked
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        name = try values.decode(String.self, forKey: .name)
        bio = try values.decodeIfPresent(String.self, forKey: .bio)
        recipeCount = Community.count(values.number(.recipeCount))
        followerCount = Community.count(values.number(.followerCount))
        followingCount = Community.count(values.number(.followingCount))
        viewer = try values.decodeIfPresent(Viewer.self, forKey: .viewer)
        blocked = try values.decodeIfPresent(Bool.self, forKey: .blocked)
    }
}

nonisolated extension Community.Me: Decodable {
    private enum CodingKeys: String, CodingKey { case moderator }

    init(from decoder: Decoder) throws {
        cook = try Community.Cook(from: decoder)
        moderator = try decoder.container(keyedBy: CodingKeys.self).decodeIfPresent(Bool.self, forKey: .moderator) ?? false
    }
}

extension Community.Listing {
    /// A recipe from a community or server without v2, which sends whole recipes in its list.
    @MainActor init(legacy recipe: DTO.CommunityRecipe) {
        self.init(id: recipe.id, revision: 0, createdAt: recipe.createdAt ?? "", updatedAt: recipe.createdAt ?? "",
                  author: Community.Author(id: recipe.author?.id ?? "", name: recipe.author?.name ?? ""),
                  title: recipe.title, description: recipe.description, tags: recipe.tags ?? [], servings: Community.servings(recipe.servings),
                  totalTimeMinutes: Community.minutes(recipe.totalTimeMinutes), photoUrl: recipe.photoDataUrl ?? recipe.photoUrl,
                  ingredientNames: recipe.ingredients.map(\.name), likeCount: 0, saveCount: 0, madeCount: 0)
    }
}

extension Community.Detail {
    /// A recipe from a community or server without v2: no tips, counts or viewer state.
    @MainActor init(legacy recipe: DTO.CommunityRecipe, revision: Int = 0) {
        var listing = Community.Listing(legacy: recipe)
        listing.revision = max(0, revision)
        let photo = [recipe.photoDataUrl, recipe.photoUrl].compactMap { $0 }.first { $0.hasPrefix("data:") }
        self.init(listing: listing, visibility: "public",
                  snapshot: Community.Snapshot(title: recipe.title, description: recipe.description, tags: recipe.tags ?? [], servings: Community.servings(recipe.servings),
                                               totalTimeMinutes: Community.minutes(recipe.totalTimeMinutes), sourceUrl: recipe.sourceUrl, photoDataUrl: photo,
                                               ingredients: recipe.ingredients.map { .init(name: $0.name, quantity: Community.quantity($0.quantity), unit: $0.unit, note: $0.note) },
                                               steps: recipe.steps.map { .init(text: $0.text) }),
                  tips: [])
    }
}

extension ReportReason {
    /// The contract's value for the reasons the report sheet offers.
    var contract: Community.ReportReason {
        switch self {
        case .offensive: .offensive
        case .harassment: .harassment
        case .sexual: .sexual
        case .spam: .spam
        case .dangerous: .dangerous
        case .copyright: .copyright
        case .other: .other
        }
    }
}
