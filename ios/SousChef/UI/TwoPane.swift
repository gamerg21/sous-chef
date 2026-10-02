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
        // closes.
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

    /// Tracks how an iPhone Duo is being held. Always flat before the iOS
    /// 27.1 SDK and on devices without a hinge.
    func tracksFoldPosture(_ posture: Binding<FoldPosture>) -> some View {
        modifier(FoldPostureTracker(posture: posture))
    }
}

/// How an iPhone Duo is being held, from its hinge and the way its fold runs
/// across the window.
enum FoldPosture: Equatable {
    /// Open flat, closed, or a device without a hinge.
    case flat
    /// Half open with the fold running top to bottom, standing like a book.
    case book
    /// Half open with the fold running across, propped like a laptop.
    case laptop

    static func resolve(halfOpen: Bool, foldRunsAcross: Bool) -> FoldPosture {
        guard halfOpen else { return .flat }
        return foldRunsAcross ? .laptop : .book
    }
}

private struct FoldPostureTracker: ViewModifier {
    @Binding var posture: FoldPosture
    @State private var halfOpen = false
    @State private var foldRunsAcross = false

    func body(content: Content) -> some View {
        tracked(content)
            .onGeometryChange(for: Bool.self) { proxy in
                // The fold divides the window's long side, so with no fold
                // reported a window taller than wide has it running across.
                #if canImport(SwiftUI, _version: 8.0.85)
                if #available(iOS 27.1, *),
                   let fold = proxy.reservedRegions(kind: .division, options: .includeInactive).first {
                    return fold.frame.width > fold.frame.height
                }
                #endif
                return proxy.size.height > proxy.size.width
            } action: { foldRunsAcross = $0 }
            .onChange(of: halfOpen, initial: true) { update() }
            .onChange(of: foldRunsAcross) { update() }
    }

    @ViewBuilder private func tracked(_ content: Content) -> some View {
        #if canImport(SwiftUI, _version: 8.0.85)
        if #available(iOS 27.1, *) {
            content.onHingeChange { _, context in halfOpen = context.hinge?.status == .partiallyOpen }
        } else {
            content
        }
        #else
        content
        #endif
    }

    private func update() {
        #if DEBUG
        // The simulator can't turn an unfolded Duo on its side, so this
        // previews the laptop posture for screenshots.
        if ProcessInfo.processInfo.arguments.contains("-simulateLaptopPosture") {
            posture = .laptop
            return
        }
        #endif
        posture = .resolve(halfOpen: halfOpen, foldRunsAcross: foldRunsAcross)
    }
}
