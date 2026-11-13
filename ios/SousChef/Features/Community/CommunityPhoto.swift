import SwiftUI

/// A community recipe's photo, loaded and cached by `CommunityImageLoader`.
/// It fills whatever frame the caller gives it, and shows the placeholder in
/// the same frame while loading or without a photo, so nothing moves when the
/// photo arrives.
struct CommunityPhoto: View {
    let source: String?
    /// Longest side of the decoded image, in pixels.
    var maxPixel = 600
    @State private var loaded: UIImage?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let image = loaded ?? CommunityImageLoader.shared.cached(source, maxPixel: maxPixel)
        Color.clear
            .overlay {
                if let image {
                    Image(uiImage: image).resizable().scaledToFill().transition(.opacity)
                } else {
                    LinearGradient(colors: [Color.brand.opacity(0.28), Color.brand.opacity(0.08)], startPoint: .topLeading, endPoint: .bottomTrailing)
                    Image(systemName: "fork.knife")
                        .font(.title.weight(.light))
                        .foregroundStyle(Color.brand.opacity(0.7))
                }
            }
            .clipped()
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: image == nil)
            .accessibilityHidden(true)
            .task(id: source) {
                loaded = await CommunityImageLoader.shared.image(for: source, maxPixel: maxPixel)
            }
    }
}
