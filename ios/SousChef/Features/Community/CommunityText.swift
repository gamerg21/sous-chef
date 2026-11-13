import Foundation

/// Wording shared by the community screens.
enum CommunityText {
    /// "1 like", "3 likes".
    static func count(_ value: Int, _ singular: String, _ plural: String? = nil) -> String {
        "\(value.formatted()) \(value == 1 ? singular : plural ?? singular + "s")"
    }

    /// "4.5", "4".
    static func rating(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...1)))
    }

    /// "20 min", "1 hr 30 min".
    static func time(minutes: Double) -> String {
        // `Duration` traps on a number it can't hold, so the bound holds here too.
        let whole = minutes.isFinite ? Int(min(1_000_000, max(1, minutes.rounded()))) : 1
        return Duration.seconds(whole * 60).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated))
    }

    /// "You have 5 of 7", or "You have everything".
    static func pantry(_ match: Community.PantryMatch) -> String {
        match.isReady ? "You have everything" : "You have \(match.have) of \(match.total)"
    }

    /// "Missing salt, basil and 2 more".
    static func missing(_ match: Community.PantryMatch, limit: Int = 3) -> String? {
        let names = match.missing.compactMap(\.nilIfEmpty)
        guard !names.isEmpty else { return nil }
        let shown = names.prefix(limit).joined(separator: ", ")
        return names.count > limit ? "Missing \(shown) and \(names.count - limit) more" : "Missing \(shown)"
    }

    /// What VoiceOver reads for a recipe card.
    static func summary(of listing: Community.Listing, social: Bool, saved: Bool, pantry: Community.PantryMatch?) -> String {
        var parts = [listing.title]
        if let author = listing.author.name.nilIfEmpty { parts.append("by \(author)") }
        if let minutes = listing.totalTimeMinutes, minutes > 0 { parts.append(time(minutes: minutes)) }
        if social, let rating = listing.rating { parts.append("rated \(Self.rating(rating)) out of 5") }
        if saved { parts.append("saved to your recipes") }
        if let pantry, pantry.total > 0 {
            parts.append(Self.pantry(pantry))
            if let missing = missing(pantry) { parts.append(missing) }
        }
        return parts.joined(separator: ", ")
    }
}
