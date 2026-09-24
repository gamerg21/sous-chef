import Foundation
import Observation

/// On-device safeguards for community recipes: the guidelines agreement,
/// hidden recipes and blocked cooks. There is no server-side moderation yet,
/// so reports go to the maintainer by email.
@Observable
final class CommunityModeration {
    static let shared = CommunityModeration()
    static let guidelinesVersion = 1
    static let guidelinesURL = URL(string: "https://sous-chef-website.vercel.app/community-guidelines/")!
    static let contactEmail = "community-souschef@georgevina.com"

    private let defaults: UserDefaults
    private(set) var acceptedGuidelinesVersion: Int
    /// Recipe id → title, so Settings can list what's hidden.
    private(set) var hiddenRecipes: [String: String]
    /// Author key → display name.
    private(set) var blockedAuthors: [String: String]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        acceptedGuidelinesVersion = defaults.integer(forKey: Keys.guidelines)
        hiddenRecipes = defaults.dictionary(forKey: Keys.hidden) as? [String: String] ?? [:]
        blockedAuthors = defaults.dictionary(forKey: Keys.blocked) as? [String: String] ?? [:]
    }

    var hasAcceptedGuidelines: Bool { acceptedGuidelinesVersion >= Self.guidelinesVersion }

    func acceptGuidelines() {
        acceptedGuidelinesVersion = Self.guidelinesVersion
        defaults.set(acceptedGuidelinesVersion, forKey: Keys.guidelines)
    }

    func hide(_ recipe: DTO.CommunityRecipe) {
        hiddenRecipes[recipe.id] = recipe.title
        defaults.set(hiddenRecipes, forKey: Keys.hidden)
    }

    func unhide(id: String) {
        hiddenRecipes[id] = nil
        defaults.set(hiddenRecipes, forKey: Keys.hidden)
    }

    func block(_ author: DTO.CommunityRecipe.Author) {
        blockedAuthors[Self.key(for: author)] = author.name
        defaults.set(blockedAuthors, forKey: Keys.blocked)
    }

    func unblock(key: String) {
        blockedAuthors[key] = nil
        defaults.set(blockedAuthors, forKey: Keys.blocked)
    }

    func isBlocked(_ author: DTO.CommunityRecipe.Author?) -> Bool {
        guard let author else { return false }
        return blockedAuthors[Self.key(for: author)] != nil
    }

    /// Hidden, from a blocked cook, or caught by the word filter.
    func isHidden(_ recipe: DTO.CommunityRecipe) -> Bool {
        hiddenRecipes[recipe.id] != nil || isBlocked(recipe.author) || ContentFilter.isObjectionable(recipe)
    }

    func visible(_ recipes: [DTO.CommunityRecipe]) -> [DTO.CommunityRecipe] {
        recipes.filter { !isHidden($0) }
    }

    /// Prefers the stable author id; falls back to the display name.
    static func key(for author: DTO.CommunityRecipe.Author) -> String {
        if let id = author.id?.trimmingCharacters(in: .whitespaces), !id.isEmpty { return "id:\(id)" }
        return "name:\(author.name.trimmingCharacters(in: .whitespaces).lowercased())"
    }

    private enum Keys {
        static let guidelines = "community.guidelinesAccepted"
        static let hidden = "community.hiddenRecipes"
        static let blocked = "community.blockedAuthors"
    }
}

/// A small whole-word profanity and slur filter for community recipes.
enum ContentFilter {
    /// ROT13-encoded so the source stays readable.
    private static let encoded = """
    shpx shpxrq shpxre shpxvat zbgureshpxre fuvg fuvggl ohyyfuvg phag ovgpu nffubyr onfgneq juber fyhg \
    avttre avttn snttbg snt xvxr fcvp puvax genaal
    """

    static let terms: Set<String> = Set(encoded.split(separator: " ").map { rot13(String($0)) })

    static func isObjectionable(_ text: String) -> Bool {
        let words = text.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
            .split { !$0.isLetter && !$0.isNumber }
        return words.contains { word in
            terms.contains(String(word)) || (word.count > 3 && word.hasSuffix("s") && terms.contains(String(word.dropLast())))
        }
    }

    static func isObjectionable(_ recipe: DTO.CommunityRecipe) -> Bool {
        var fields = [recipe.title, recipe.description ?? "", recipe.author?.name ?? ""]
        fields += recipe.tags ?? []
        fields += recipe.ingredients.flatMap { [$0.name, $0.note ?? ""] }
        fields += recipe.steps.map(\.text)
        return isObjectionable(fields.joined(separator: "\n"))
    }

    private static func rot13(_ text: String) -> String {
        String(text.unicodeScalars.map { scalar -> Character in
            switch scalar {
            case "a"..."z": Character(UnicodeScalar((scalar.value - 97 + 13) % 26 + 97)!)
            case "A"..."Z": Character(UnicodeScalar((scalar.value - 65 + 13) % 26 + 65)!)
            default: Character(scalar)
            }
        })
    }
}

enum ReportReason: String, CaseIterable, Identifiable {
    case offensive = "Offensive or hateful"
    case harassment = "Harassment"
    case sexual = "Sexual content"
    case spam = "Spam or scam"
    case dangerous = "Dangerous or unsafe food advice"
    case copyright = "Copyright"
    case other = "Other"

    var id: String { rawValue }
}

struct CommunityReport {
    let recipe: DTO.CommunityRecipe
    let reason: ReportReason
    let note: String
    let origin: String

    var subject: String { "Sous Chef community report: \(recipe.id)" }

    var body: String {
        let info = Bundle.main.infoDictionary
        let version = "\(info?["CFBundleShortVersionString"] as? String ?? "?") (\(info?["CFBundleVersion"] as? String ?? "?"))"
        var lines = [
            "Recipe ID: \(recipe.id)",
            "Title: \(recipe.title)",
            "Author: \(recipe.author?.name ?? "Unknown")\(recipe.author?.id.map { " (\($0))" } ?? "")",
            "Community: \(origin.isEmpty ? "Unknown" : origin)",
        ]
        if let source = recipe.sourceUrl { lines.append("Source: \(source)") }
        lines += [
            "Reason: \(reason.rawValue)",
            "Note: \(note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "None" : note.trimmingCharacters(in: .whitespacesAndNewlines))",
            "App version: \(version) (iOS)",
        ]
        return lines.joined(separator: "\n")
    }

    var mailtoURL: URL? {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = CommunityModeration.contactEmail
        components.queryItems = [URLQueryItem(name: "subject", value: subject), URLQueryItem(name: "body", value: body)]
        return components.url
    }
}
