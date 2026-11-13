import Foundation
import ImageIO
import UIKit

/// Loads community recipe photos: an https `photoUrl`, or the inline `data:`
/// URL a community from before v2 sends. Decoded images are downsampled and
/// kept in memory; downloads are cached on disk by `URLCache`. Requests carry
/// no cookies or credentials.
///
///     @State private var image: UIImage?
///     …
///     .task(id: listing.photoUrl) { image = await CommunityImageLoader.shared.image(for: listing.photoUrl, maxPixel: 600) }
///
/// Cancelling the task (the row scrolls away) cancels the download.
final class CommunityImageLoader {
    static let shared = CommunityImageLoader()

    /// Photos are a few hundred kilobytes; anything far larger isn't one.
    nonisolated static let byteLimit = 10_000_000
    /// Refused before decoding, as in `ImageTools`.
    nonisolated static let maxSourcePixels = 100_000_000

    static let cachingSession: URLSession = {
        let configuration = BoundedFetch.anonymousConfiguration
        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?.appending(path: "CommunityPhotos")
        configuration.urlCache = URLCache(memoryCapacity: 8_000_000, diskCapacity: 100_000_000, directory: directory)
        configuration.requestCachePolicy = .useProtocolCachePolicy
        return URLSession(configuration: configuration)
    }()

    private let session: URLSession
    private let cache = NSCache<NSString, UIImage>()

    init(session: URLSession = CommunityImageLoader.cachingSession, countLimit: Int = 150) {
        self.session = session
        cache.countLimit = countLimit
    }

    private func key(_ source: String, _ maxPixel: Int) -> NSString {
        // Inline photos are too long to be keys themselves.
        (source.hasPrefix("data:") ? "\(maxPixel)|data|\(source.utf8.count)|\(source.hashValue)" : "\(maxPixel)|\(source)") as NSString
    }

    /// The image if it's in memory, for showing without a flash.
    func cached(_ source: String?, maxPixel: Int = 600) -> UIImage? {
        source.flatMap { cache.object(forKey: key($0, maxPixel)) }
    }

    /// The photo, at most `maxPixel` on its longest side. Nil when there is
    /// none, it can't be loaded, or the task was cancelled.
    func image(for source: String?, maxPixel: Int = 600) async -> UIImage? {
        guard let source, !source.isEmpty else { return nil }
        let key = key(source, maxPixel)
        if let image = cache.object(forKey: key) { return image }
        guard let data = await data(for: source), !Task.isCancelled,
              let cgImage = await Self.downsample(data, maxPixel: maxPixel) else { return nil }
        let image = UIImage(cgImage: cgImage)
        cache.setObject(image, forKey: key)
        return image
    }

    private func data(for source: String) async -> Data? {
        if source.hasPrefix("data:") { return Community.dataURLBytes(source) }
        guard let url = URL(string: source), url.scheme?.lowercased() == "https" else { return nil }
        guard let (data, response) = try? await BoundedFetch.data(for: URLRequest(url: url), limit: Self.byteLimit, redirects: .anyCredentialFree, session: session),
              response.statusCode == 200 else { return nil }
        return data
    }

    @concurrent
    private nonisolated static func downsample(_ data: Data, maxPixel: Int) async -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width * height <= maxSourcePixels else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, maxPixel),
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}
