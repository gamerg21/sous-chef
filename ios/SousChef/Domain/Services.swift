import Foundation
import ImageIO
import UIKit

enum ImageTools {
    /// Larger images are refused before decoding: a small file can declare
    /// enormous dimensions and exhaust memory once decoded. 100 MP still
    /// covers the largest camera photos.
    static let maxSourcePixels = 100_000_000

    /// Pixel size read from the image header, without decoding the image.
    static func pixelSize(_ data: Data) -> CGSize? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0 else { return nil }
        return CGSize(width: width, height: height)
    }

    /// JPEG, longest side at most `maxDimension`, for storage and upload.
    /// Downsamples while decoding, so memory stays proportional to the result.
    static func compressed(_ data: Data, maxDimension: CGFloat = 1600, quality: CGFloat = 0.8, maxPixels: Int = maxSourcePixels) -> Data? {
        guard let size = pixelSize(data), Int(size.width) * Int(size.height) <= maxPixels,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, min(maxDimension, max(size.width, size.height))),
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image).jpegData(compressionQuality: quality)
    }

    /// A synced photo as stored on this device: kept as-is when it is already
    /// small, otherwise shrunk. Nil when it isn't a usable image.
    static func fitted(_ data: Data, maxDimension: CGFloat = 1600, maxPixels: Int = maxSourcePixels) -> Data? {
        guard let size = pixelSize(data) else { return nil }
        return max(size.width, size.height) <= maxDimension ? data : compressed(data, maxDimension: maxDimension, maxPixels: maxPixels)
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
/// server it uses the server's community connection; otherwise it reads the
/// community's public `/api/v1/recipes` endpoint directly.
enum CommunityService {
    /// Custom community address from Settings; overrides the built-in one.
    static var directURL: String {
        get { UserDefaults.standard.string(forKey: "community.url") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "community.url") }
    }

    /// Built-in community, from `SousChefCommunityURL` in SousChef-Info.plist.
    static let defaultURL: URL? = httpsURL(Bundle.main.object(forInfoDictionaryKey: "SousChefCommunityURL") as? String)

    /// The community used without a connected server: the custom address, else the built-in one.
    static var communityURL: URL? { httpsURL(directURL) ?? defaultURL }

    static var isConfigured: Bool { communityURL != nil }

    static func httpsURL(_ value: String?) -> URL? {
        guard let value = value?.nilIfEmpty, let url = URL(string: value), url.scheme == "https", url.host() != nil else { return nil }
        return url
    }

    static func list(search: String, server: CompanionServer) async throws -> [DTO.CommunityRecipe] {
        if let client = server.client, server.isConnected {
            let result = try await client.call("community:listRecipes", ["search": search, "limit": 50], as: DTO.CommunityList.self)
            if result.available != false { return result.recipes }
        }
        guard let base = communityURL else { return [] }
        var components = URLComponents(url: base.appending(path: "api/v1/recipes"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "search", value: search), URLQueryItem(name: "limit", value: "50")]
        guard let url = components?.url else { return [] }
        let (data, _) = try await URLSession.shared.data(from: url)
        struct Page: Decodable { let recipes: [DTO.CommunityPublication] }
        return try JSONDecoder().decode(Page.self, from: data).recipes.map(\.recipe)
    }
}
