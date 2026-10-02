import SwiftUI

/// Two panes meeting at the fold of an iPhone Duo, or at the middle of any
/// other screen, so nothing sits on the crease. Side by side when the phone
/// lies open; one above the other when it's propped half open like a laptop.
struct TwoPane<Primary: View, Secondary: View>: View {
    var axis: Axis = .horizontal
    @ViewBuilder var primary: Primary
    @ViewBuilder var secondary: Secondary

    var body: some View {
        GeometryReader { proxy in
            let split = Self.split(in: proxy, axis: axis)
            if axis == .horizontal {
                HStack(spacing: split.gutter) {
                    primary.frame(width: split.primary)
                    secondary.frame(maxWidth: .infinity)
                }
            } else {
                VStack(spacing: split.gutter) {
                    primary.frame(height: split.primary)
                    secondary.frame(maxHeight: .infinity)
                }
            }
        }
    }

    /// The first pane's length along the axis, and the gap over the fold.
    private static func split(in proxy: GeometryProxy, axis: Axis) -> (primary: CGFloat, gutter: CGFloat) {
        let horizontal = axis == .horizontal
        let length = horizontal ? proxy.size.width : proxy.size.height
        // Reserved regions arrived in the iOS 27.1 SDK (SwiftUI 8.0.85).
        // Including inactive ones keeps the panes put as the phone opens and
        // closes. The simulator reports none, so it takes the fallback below.
        #if canImport(SwiftUI, _version: 8.0.85)
        if #available(iOS 27.1, *),
           let fold = proxy.reservedRegions(kind: .division, options: .includeInactive).first {
            let start = horizontal ? fold.frame.minX : fold.frame.minY
            let end = horizontal ? fold.frame.maxX : fold.frame.maxY
            if start > 0, end < length { return (start, end - start) }
        }
        #endif
        // Otherwise split at the middle of the screen rather than of the
        // content: the unfolded Duo keeps its toolbar in a rail along one
        // edge, which would pull a content midpoint off the crease.
        let insets = proxy.safeAreaInsets
        let before = horizontal ? insets.leading : insets.top
        let after = horizontal ? insets.trailing : insets.bottom
        let middle = (length + before + after) / 2 - before
        return (min(max(middle, length * 0.4), length * 0.6), 0)
    }
}

extension View {
    /// Tracks whether this view is wide enough for two panes: the unfolded
    /// iPhone Duo, an iPad, a Mac, or a phone on its side.
    func tracksTwoPaneWidth(_ isWide: Binding<Bool>) -> some View {
        onGeometryChange(for: Bool.self) { $0.size.width >= 700 } action: { isWide.wrappedValue = $0 }
    }

    /// Tracks whether an iPhone Duo is half open, as when it's propped on the
    /// counter. Always false before the iOS 27.1 SDK.
    @ViewBuilder func tracksHalfOpen(_ halfOpen: Binding<Bool>) -> some View {
        #if canImport(SwiftUI, _version: 8.0.85)
        if #available(iOS 27.1, *) {
            onHingeChange { _, context in halfOpen.wrappedValue = context.hinge?.status == .partiallyOpen }
        } else {
            self
        }
        #else
        self
        #endif
    }
}
