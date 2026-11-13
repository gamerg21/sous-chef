import SwiftUI

/// The scrolling body of a community recipe's page.
struct CommunityRecipeContent: View {
    /// Text lines stay readable on an iPad or a wide window.
    static let readableWidth: CGFloat = 720

    let model: CommunityRecipeModel
    let listing: Community.Listing
    let saveError: String?
    let report: (CommunityReportTarget) -> Void
    let block: (Community.Author) -> Void
    let rate: () -> Void
    @Environment(CommunityClient.self) private var client
    @ScaledMetric(relativeTo: .body) private var photoHeight: CGFloat = 240

    private var isSocial: Bool { client.capabilities.social }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                CommunityPhoto(source: listing.photoUrl, maxPixel: 1600)
                    .frame(height: listing.photoUrl == nil ? 120 : min(photoHeight, 320))
                    .frame(maxWidth: .infinity)
                    .clipShape(.rect(cornerRadius: 24))
                Text(listing.title)
                    .heroTitle()
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("communityRecipeTitle")
                if let description = listing.description?.nilIfEmpty {
                    Text(description).foregroundStyle(.secondary)
                }
                CommunityCookRow(model: model, author: listing.author)
                CommunityRecipeFacts(listing: listing)
                if isSocial {
                    CommunityEngagementRow(model: model, listing: listing)
                }
                if let pantry = client.pantryMatch(for: listing), pantry.total > 0 {
                    CommunityPantryCard(match: pantry)
                }
                if let detail = model.detail {
                    CommunityIngredientsCard(snapshot: detail.snapshot, missing: client.pantryMatch(for: listing)?.missing ?? [])
                    CommunityStepsList(steps: detail.snapshot.steps)
                    if let source = detail.snapshot.sourceUrl, let url = URL(string: source), url.scheme?.hasPrefix("http") == true {
                        Link(destination: url) {
                            Label(url.host() ?? source, systemImage: "safari").font(.footnote)
                        }
                    }
                    if isSocial {
                        if !model.isOwn { CommunityMadeCard(model: model, rate: rate) }
                        CommunityTipsSection(model: model, listing: listing, report: report, block: block)
                    }
                } else if case .failed(let message) = model.phase {
                    ErrorBanner(message: message)
                    Button("Try again", systemImage: "arrow.clockwise") { Task { await model.load() } }
                        .buttonStyle(.glass)
                } else {
                    CommunityRecipeSkeleton()
                }
            }
            .frame(maxWidth: Self.readableWidth, alignment: .leading)
            // Rows can round a fraction of a point wider than the screen, which
            // lets the page drag sideways; cap the content at the offered width.
            .frame(minWidth: 0, maxWidth: .infinity)
            .padding()
        }
        .accessibilityIdentifier("communityRecipe")
    }
}

/// Who shared the recipe, with a way to their profile and a Follow button.
struct CommunityCookRow: View {
    let model: CommunityRecipeModel
    let author: Community.Author
    @Environment(CommunityClient.self) private var client

    private var name: String { author.name.nilIfEmpty ?? "Community cook" }
    private var linksToProfile: Bool { client.capabilities.social && !author.id.isEmpty }

    var body: some View {
        AdaptiveStack(spacing: 12, verticalSpacing: 8) {
            if linksToProfile {
                NavigationLink(value: CommunityRoute.cook(author)) {
                    HStack(spacing: 10) {
                        IconBadge(systemImage: "person.fill", size: 40)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Shared by").font(.caption).foregroundStyle(.secondary)
                            Text(name).font(.headline).multilineTextAlignment(.leading)
                        }
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                    }
                    .frame(minHeight: 44)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Shared by \(name)")
                .accessibilityHint("Opens their profile.")
                .accessibilityAddTraits(.isButton)
                .accessibilityIdentifier("communityCook")
            } else {
                Label("Shared by \(name)", systemImage: "person.crop.circle").foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if linksToProfile, !model.isOwn, let follow = model.follow {
                CommunityFollowButton(author: author, state: follow)
            }
        }
    }
}

/// Follow or Following, changed at once and put back if the community refuses.
struct CommunityFollowButton: View {
    let author: Community.Author
    let state: CommunitySocial.FollowState
    @Environment(CommunitySocial.self) private var social

    var body: some View {
        Group {
            if state.following {
                Button(action: toggle) { label }.buttonStyle(.glass)
            } else {
                Button(action: toggle) { label }.buttonStyle(.glassProminent)
            }
        }
        .animation(.snappy, value: state.following)
        .sensoryFeedback(.selection, trigger: state.following)
        .accessibilityLabel(state.following ? "Following \(author.name)" : "Follow \(author.name)")
        .accessibilityHint(state.following ? "Stops following this cook." : "Shows their new recipes in Following.")
        .accessibilityAddTraits(state.following ? .isSelected : [])
        .accessibilityIdentifier("communityFollow")
    }

    private var label: some View {
        Label(state.following ? "Following" : "Follow", systemImage: state.following ? "checkmark" : "plus")
            .font(.subheadline.weight(.semibold))
            .frame(minHeight: 30)
    }

    private func toggle() {
        guard social.requireAccount() else { return }
        Task {
            do { try await social.toggleFollow(cookID: author.id, current: state) } catch { social.report(error) }
        }
    }
}

/// Time, servings and tags.
struct CommunityRecipeFacts: View {
    let listing: Community.Listing

    var body: some View {
        if listing.totalTimeMinutes != nil || listing.servings != nil || !listing.tags.isEmpty {
            FlowLayout(spacing: 8) {
                if let minutes = listing.totalTimeMinutes, minutes > 0 {
                    Chip(text: CommunityText.time(minutes: minutes), systemImage: "timer")
                }
                if let servings = listing.servings.flatMap(Community.whole), servings > 0 {
                    Chip(text: CommunityText.count(servings, "serving"), systemImage: "person.2")
                }
                ForEach(listing.tags, id: \.self) { Chip(text: $0, systemImage: "number", tint: .secondary) }
            }
        }
    }
}

/// The like button and how the recipe has been rated.
struct CommunityEngagementRow: View {
    let model: CommunityRecipeModel
    let listing: Community.Listing

    var body: some View {
        AdaptiveStack(spacing: 14, verticalSpacing: 8) {
            CommunityLikeButton(listing: listing, prominent: true)
            if let rating = listing.rating, listing.madeCount > 0 {
                HStack(spacing: 8) {
                    StarRating(rating: rating)
                    Text("\(CommunityText.rating(rating)) · \(CommunityText.count(listing.madeCount, "cook")) made this")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Rated \(CommunityText.rating(rating)) out of 5 by \(CommunityText.count(listing.madeCount, "cook"))")
                .accessibilityIdentifier("communityRatingSummary")
            } else {
                Text("No ratings yet").font(.subheadline).foregroundStyle(.secondary)
                    .accessibilityIdentifier("communityRatingSummary")
            }
        }
    }
}

/// How much of the recipe the pantry covers.
struct CommunityPantryCard: View {
    let match: Community.PantryMatch

    var body: some View {
        Card {
            Eyebrow("From your pantry", systemImage: "cabinet")
            Gauge(value: Double(match.have), in: 0...Double(max(1, match.total))) {
                EmptyView()
            }
            .gaugeStyle(.linearCapacity)
            .tint(match.isReady ? Color.brand : .orange)
            .accessibilityHidden(true)
            Text(match.isReady ? "You have everything for this recipe." : "You have \(match.have) of \(match.total) ingredients.")
                .font(.callout)
            if let missing = CommunityText.missing(match, limit: 8) {
                Text(missing).font(.footnote).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("communityPantryMatch")
    }
}

struct CommunityIngredientsCard: View {
    let snapshot: Community.Snapshot
    /// Names the pantry lacks.
    let missing: [String]

    var body: some View {
        let lacking = Set(missing.map(normalizeName))
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow("Ingredients", systemImage: "list.bullet")
            Card(padding: 14) {
                ForEach(Array(snapshot.ingredients.enumerated()), id: \.offset) { index, ingredient in
                    let have = !lacking.contains(normalizeName(ingredient.name))
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: have ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(have ? Color.brand : Color.secondary)
                            .accessibilityLabel(have ? "In your pantry" : "Not in your pantry")
                        TrailingDetailRow {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(ingredient.name)
                                if let note = ingredient.note?.nilIfEmpty { Text(note).font(.caption).foregroundStyle(.secondary) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text(Units.amount(ingredient.quantity, ingredient.unit))
                                .font(.callout.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    if index < snapshot.ingredients.count - 1 { Divider() }
                }
                if snapshot.ingredients.isEmpty { Text("No ingredients listed.").foregroundStyle(.secondary) }
            }
        }
    }
}

struct CommunityStepsList: View {
    let steps: [Community.Snapshot.Step]
    @ScaledMetric(relativeTo: .subheadline) private var badge: CGFloat = 28

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow("Steps", systemImage: "list.number")
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)")
                        .font(.subheadline.bold().monospacedDigit())
                        .foregroundStyle(Color.brand)
                        .frame(minWidth: badge, minHeight: badge)
                        .background(Color.brandSoft, in: .circle)
                        .accessibilityLabel("Step \(index + 1)")
                    Text(step.text).fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
            if steps.isEmpty { Text("No steps listed.").foregroundStyle(.secondary) }
        }
    }
}

/// Stands in for the ingredients and steps while they load.
struct CommunityRecipeSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Card {
                ForEach(0..<4, id: \.self) { _ in Text("An ingredient and how much of it") }
            }
            ForEach(0..<3, id: \.self) { _ in Text("A step of the method that explains what to do next.") }
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading recipe")
    }
}
