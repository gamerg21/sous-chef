import SwiftUI

/// Tips from cooks who made the recipe, newest first, each with a way to
/// report it or block its cook.
struct CommunityTipsSection: View {
    let model: CommunityRecipeModel
    let listing: Community.Listing
    let report: (CommunityReportTarget) -> Void
    let block: (Community.Author) -> Void
    @Environment(CommunitySocial.self) private var social

    var body: some View {
        let tips = model.tips
        if !tips.isEmpty || model.hasMoreTips {
            VStack(alignment: .leading, spacing: 10) {
                Eyebrow("Tips from cooks", systemImage: "text.bubble")
                ForEach(tips) { tip in
                    CommunityTipRow(tip: tip, isOwn: tip.author.id == social.myID,
                                    report: { report(CommunityReportTarget(listing: listing, tip: tip)) },
                                    block: { block(tip.author) })
                }
                if model.hasMoreTips {
                    Button {
                        Task { await model.showMoreTips() }
                    } label: {
                        if model.loadingTips { ProgressView() } else { Label("Show more", systemImage: "chevron.down") }
                    }
                    .buttonStyle(.glass)
                    .disabled(model.loadingTips)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("communityMoreTips")
                }
            }
        }
    }
}

struct CommunityTipRow: View {
    let tip: Community.Tip
    let isOwn: Bool
    let report: () -> Void
    let block: () -> Void
    @Environment(CommunityClient.self) private var client

    var body: some View {
        Card(padding: 14) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    if tip.author.id.isEmpty {
                        Text(tip.author.name).font(.subheadline.weight(.semibold))
                    } else {
                        NavigationLink(value: CommunityRoute.cook(tip.author)) {
                            Text(tip.author.name).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
                        }
                        .accessibilityHint("Opens their profile.")
                    }
                    AdaptiveStack(spacing: 8, verticalSpacing: 2) {
                        StarRating(rating: Double(tip.rating)).font(.caption)
                        if let date = tip.created {
                            Text(date, format: .relative(presentation: .named)).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
                if !isOwn {
                    Menu {
                        Button("Report tip", systemImage: "flag", action: report)
                        Button("Block \(tip.author.name)", systemImage: "person.crop.circle.badge.xmark", role: .destructive, action: block)
                            .tint(.red)
                    } label: {
                        Label("More about the tip by \(tip.author.name)", systemImage: "ellipsis")
                            .labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(.rect)
                    }
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("communityTipMenu")
                }
            }
            Text(tip.tip ?? "").font(.callout).fixedSize(horizontal: false, vertical: true)
        }
    }
}
