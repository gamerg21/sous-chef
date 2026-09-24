import Foundation
import UIKit

enum ImageTools {
    /// JPEG, longest side at most `maxDimension`, for storage and upload.
    static func compressed(_ data: Data, maxDimension: CGFloat = 1600, quality: CGFloat = 0.8) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        let scale = min(1, maxDimension / max(longest, 1))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: quality)
    }
}

/// Barcode lookups go straight to Open Food Facts (ODbL), as the web app does.
enum OpenFoodFacts {
    struct Result {
        var name: String
        var category: String?
        var facts: FoodFacts
        var attributionURL: URL
    }

    enum LookupError: LocalizedError {
        case invalid, notFound, failed
        var errorDescription: String? {
            switch self {
            case .invalid: "Enter a barcode with 8–14 digits."
            case .notFound: "Open Food Facts doesn't know this product yet. Scan its label or add it by hand."
            case .failed: "Barcode lookup failed. Check your connection and try again."
            }
        }
    }

    static var enabled: Bool {
        get { UserDefaults.standard.object(forKey: "openFoodFacts.enabled") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "openFoodFacts.enabled") }
    }

    static func lookup(_ raw: String) async throws -> Result {
        let code = raw.filter(\.isNumber)
        guard (8...14).contains(code.count) else { throw LookupError.invalid }
        guard let url = URL(string: "https://world.openfoodfacts.org/api/v2/product/\(code).json") else { throw LookupError.invalid }
        var request = URLRequest(url: url, timeoutInterval: 8)
        request.setValue("SousChef-iOS/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1") (https://github.com/gamerg21/sous-chef)", forHTTPHeaderField: "User-Agent")
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await URLSession.shared.data(for: request) } catch { throw LookupError.failed }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw LookupError.notFound }
        guard status == 200, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw LookupError.failed }
        guard (json["status"] as? Int) == 1, let product = json["product"] as? [String: Any],
              let name = (product["product_name"] as? String)?.nilIfEmpty else { throw LookupError.notFound }
        let tags = product["categories_tags"] as? [String]
        let nutrition = (product["nutriments"] as? [String: Any]).map(Nutrition.init(json:))
        let facts = FoodFacts(brand: (product["brands"] as? String)?.nilIfEmpty, categoriesTags: tags,
                              ingredientsText: (product["ingredients_text"] as? String)?.nilIfEmpty,
                              allergensTags: product["allergens_tags"] as? [String],
                              nutriscoreGrade: product["nutriscore_grade"] as? String,
                              novaGroup: product["nova_group"] as? Int,
                              ecoscoreGrade: product["ecoscore_grade"] as? String,
                              imageFrontUrl: product["image_front_url"] as? String,
                              nutrition: nutrition?.isEmpty == false ? nutrition : nil)
        return Result(name: name, category: inferCategory(tags), facts: facts,
                      attributionURL: URL(string: "https://world.openfoodfacts.org/product/\(code)")!)
    }

    /// Mirrors the server's `inferCategory`.
    static func inferCategory(_ tags: [String]?) -> String? {
        guard let tags, !tags.isEmpty else { return nil }
        let joined = tags.joined(separator: " ").lowercased()
        let rules: [(String, String)] = [
            ("fruit|vegetable|produce|salad", "Produce"), ("dairies|dairy|milk|cheese|yogurt|butter|cream", "Dairy"),
            ("meat|poultry|seafood|fish|beef|pork|chicken", "Meat & Seafood"), ("frozen", "Frozen"), ("bread|bakery|baked|pastr", "Bakery"),
            ("beverage|drink|water|juice|soda|coffee|tea", "Beverages"), ("canned|preserved|tinned", "Canned Goods"), ("rice|grain|cereal", "Grains & Rice"),
            ("pasta|noodle", "Pasta & Noodles"), ("spice|seasoning|herb", "Spices & Seasonings"),
            ("condiment|sauce|ketchup|mustard|mayonnaise|dressing", "Condiments & Sauces"), ("snack|chip|cracker|candy|chocolate|biscuit|cookie", "Snacks"),
        ]
        return rules.first { joined.range(of: $0.0, options: .regularExpression) != nil }?.1 ?? "Other"
    }
}

/// Browses the optional Sous Chef recipe community. Through a connected
/// server it uses the server's community connection; otherwise it reads a
/// community's public `/api/v1/recipes` endpoint directly.
enum CommunityService {
    static var directURL: String {
        get { UserDefaults.standard.string(forKey: "community.url") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "community.url") }
    }

    static func list(search: String, server: CompanionServer) async throws -> [DTO.CommunityRecipe] {
        if let client = server.client, server.isConnected {
            let result = try await client.call("community:listRecipes", ["search": search, "limit": 50], as: DTO.CommunityList.self)
            if result.available != false { return result.recipes }
        }
        guard let base = URL(string: directURL), base.scheme == "https" else { return [] }
        var components = URLComponents(url: base.appending(path: "api/v1/recipes"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "search", value: search), URLQueryItem(name: "limit", value: "50")]
        guard let url = components?.url else { return [] }
        let (data, _) = try await URLSession.shared.data(from: url)
        struct Page: Decodable { let recipes: [DTO.CommunityPublication] }
        return try JSONDecoder().decode(Page.self, from: data).recipes.map(\.recipe)
    }

    static var isConfigured: Bool { URL(string: directURL)?.scheme == "https" }
}
