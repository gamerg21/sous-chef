import SwiftUI

/// "What's new" after updating to a new major or minor version (1.1, 2.0),
/// never for a patch (1.1.1): the App Store's update notes cover those.
/// Fresh installs see onboarding instead, and it's recorded as seen.
enum WhatsNew {
    static let seenKey = "whatsNew.seenRelease"

    struct Feature: Identifiable {
        var id: String { title }
        let systemImage: String
        let color: Color
        let title: String
        let detail: String
    }

    /// The features each release introduces, keyed by "major.minor". A release
    /// without an entry shows nothing.
    static let releases: [String: [Feature]] = [
        "1.2": [
            Feature(systemImage: "sparkles", color: .purple, title: "iPhone Duo is here",
                    detail: "Sous Chef now supports iPhone Duo. Unfold it and your kitchen spreads across both screens."),
            Feature(systemImage: "hand.draw.fill", color: .brand, title: "Drag to plan",
                    detail: "Unfold your iPhone Duo and drag recipes onto your week, right in Cook."),
            Feature(systemImage: "chart.bar.fill", color: .orange, title: "Everything at a glance",
                    detail: "Numbers beside your pantry, recipes and list. Tap one to show just those."),
            Feature(systemImage: "laptopcomputer", color: .blue, title: "Cook on the counter",
                    detail: "Prop your iPhone Duo half open: steps stand up, timers sit on the flat half."),
            Feature(systemImage: "arrow.up.arrow.down", color: .teal, title: "Sort your pantry",
                    detail: "Sort by name, what expires first or what you added last."),
        ],
        "1.1": [
            Feature(systemImage: "house.fill", color: .orange, title: "Share your kitchen",
                    detail: "Invite the people you cook with. Everyone sees and edits the same pantry, recipes, shopping list and meal plan."),
            Feature(systemImage: "calendar", color: .brand, title: "Plan your week",
                    detail: "Plan meals by day in Cook and add what's missing to your shopping list."),
            Feature(systemImage: "alarm.fill", color: .red, title: "Timers that ring",
                    detail: "Cook timers ring like alarms and count down on the Lock Screen."),
            Feature(systemImage: "arrow.uturn.backward", color: .blue, title: "Shake to undo",
                    detail: "Deleted something by mistake? Shake your iPhone to bring it back."),
            Feature(systemImage: "square.grid.2x2.fill", color: .purple, title: "New widgets",
                    detail: "See tonight's meal, food to use soon and your shopping list from the Home Screen."),
        ],
    ]

    /// "1.1" from "1.1.0" or "1.1.3".
    static func release(of version: String) -> String {
        version.split(separator: ".").prefix(2).joined(separator: ".")
    }

    /// The features to show now, if any: only for someone past onboarding
    /// whose last seen release differs from this one.
    static func features(version: String, seen: String?, onboarded: Bool) -> [Feature]? {
        let release = release(of: version)
        guard onboarded, seen != release, let features = releases[release], !features.isEmpty else { return nil }
        return features
    }

    static var currentVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }
}

struct WhatsNewView: View {
    let version: String
    let features: [WhatsNew.Feature]
    /// Opens Settings > Household; nil hides that button.
    var onSetUpHousehold: (() -> Void)?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 28) {
                VStack(spacing: 14) {
                    Image("Logo")
                        .resizable()
                        .frame(width: 76, height: 76)
                        .clipShape(.rect(cornerRadius: 18, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(spacing: 4) {
                        Text("What\u{2019}s new").font(.largeTitle.bold())
                        Text("in Sous Chef \(WhatsNew.release(of: version))").font(.title3).foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                }
                .padding(.top, 36)
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(features) { feature in
                        HStack(alignment: .top, spacing: 16) {
                            Image(systemName: feature.systemImage)
                                .font(.title2)
                                .foregroundStyle(feature.color)
                                .frame(width: 36)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(feature.title).font(.headline)
                                Text(feature.detail).font(.subheadline).foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 10) {
                Button { dismiss() } label: {
                    Text("Continue").font(.headline).frame(maxWidth: .infinity, minHeight: 32)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("whatsNewContinue")
                if let onSetUpHousehold {
                    Button {
                        dismiss()
                        onSetUpHousehold()
                    } label: {
                        Text("Set up your household").font(.headline).frame(maxWidth: .infinity, minHeight: 32)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("whatsNewHousehold")
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(.background)
        }
    }
}
