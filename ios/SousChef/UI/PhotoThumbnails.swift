import ImageIO
import UIKit

/// Downsampled photos for cards and headers. Decoding happens off the main
/// thread, and results stay in memory so scrolling back doesn't decode again.
enum PhotoThumbnails {
    /// Keys compare the full photo bytes, so an edited photo never shows a
    /// stale thumbnail.
    private nonisolated final class Key: NSObject {
        let data: Data
        let maxPixel: Int

        init(_ data: Data, _ maxPixel: Int) {
            self.data = data
            self.maxPixel = maxPixel
        }

        override var hash: Int { data.count ^ maxPixel }

        override func isEqual(_ object: Any?) -> Bool {
            guard let other = object as? Key else { return false }
            return maxPixel == other.maxPixel && data == other.data
        }
    }

    private static let cache: NSCache<Key, UIImage> = {
        let cache = NSCache<Key, UIImage>()
        cache.countLimit = 200
        return cache
    }()

    static func cached(_ data: Data, maxPixel: Int) -> UIImage? {
        cache.object(forKey: Key(data, maxPixel))
    }

    static func load(_ data: Data, maxPixel: Int) async -> UIImage? {
        if let image = cached(data, maxPixel: maxPixel) { return image }
        guard let cgImage = await downsample(data, maxPixel: maxPixel) else { return nil }
        let image = UIImage(cgImage: cgImage)
        cache.setObject(image, forKey: Key(data, maxPixel))
        return image
    }

    @concurrent
    private nonisolated static func downsample(_ data: Data, maxPixel: Int) async -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}
