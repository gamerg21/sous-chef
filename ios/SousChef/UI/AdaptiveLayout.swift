import SwiftUI

// Layouts that make room for larger text sizes. Side-by-side pieces stack
// once they no longer fit, as Apple's Dynamic Type guidance asks, so words
// wrap whole instead of breaking letter by letter in a narrow column, like a
// half of the unfolded iPhone Duo.

/// Its views side by side while they fit at their natural width, and stacked
/// when larger text or a narrow pane leaves no room.
struct AdaptiveStack<Content: View>: View {
    var alignment: VerticalAlignment = .center
    var spacing: CGFloat?
    /// Between the views once stacked; `spacing` if nil.
    var verticalSpacing: CGFloat?
    @ViewBuilder var content: Content

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: alignment, spacing: spacing) { content }
            VStack(alignment: .leading, spacing: verticalSpacing ?? spacing) { content }
        }
    }
}

/// A row's main content with a short detail, like a quantity, at the
/// trailing edge, or below it once the main content would be squeezed
/// narrower than `minimumLeadingWidth`. Takes exactly two views.
struct TrailingDetailLayout: Layout {
    /// The narrowest the main content may get before the detail moves below.
    /// Scale it with `@ScaledMetric` so it grows with the text.
    var minimumLeadingWidth: CGFloat
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 2 else { return .zero }
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let detail = subviews[1].sizeThatFits(.unspecified)
        if case .sideBySide(let leadingWidth) = arrangement(width, detail: detail) {
            let leading = subviews[0].sizeThatFits(ProposedViewSize(width: leadingWidth, height: nil))
            return CGSize(width: width ?? leading.width + spacing + detail.width, height: max(leading.height, detail.height))
        }
        let leading = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil))
        let below = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil))
        return CGSize(width: width ?? max(leading.width, below.width), height: leading.height + spacing + below.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 2 else { return }
        let detail = subviews[1].sizeThatFits(.unspecified)
        if case .sideBySide(let leadingWidth?) = arrangement(bounds.width, detail: detail) {
            subviews[0].place(at: CGPoint(x: bounds.minX, y: bounds.midY), anchor: .leading, proposal: ProposedViewSize(width: leadingWidth, height: nil))
            subviews[1].place(at: CGPoint(x: bounds.maxX, y: bounds.midY), anchor: .trailing, proposal: .unspecified)
        } else {
            let width = ProposedViewSize(width: bounds.width, height: nil)
            let leading = subviews[0].sizeThatFits(width)
            subviews[0].place(at: CGPoint(x: bounds.minX, y: bounds.minY), proposal: width)
            subviews[1].place(at: CGPoint(x: bounds.minX, y: bounds.minY + leading.height + spacing), proposal: width)
        }
    }

    private enum Arrangement {
        /// The main content's width beside the detail; nil when unbounded.
        case sideBySide(CGFloat?)
        case stacked
    }

    private func arrangement(_ width: CGFloat?, detail: CGSize) -> Arrangement {
        guard let width else { return .sideBySide(nil) }
        let leadingWidth = width - detail.width - spacing
        return leadingWidth >= minimumLeadingWidth ? .sideBySide(leadingWidth) : .stacked
    }
}

/// A row's main content and a short trailing detail, as in
/// `TrailingDetailLayout`, with the main content's minimum width given at the
/// default text size and scaled with it. Takes exactly two views.
struct TrailingDetailRow<Content: View>: View {
    var spacing: CGFloat
    var content: Content
    @ScaledMetric private var minimumLeadingWidth: CGFloat

    init(minimumLeadingWidth: CGFloat = 120, spacing: CGFloat = 8, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
        _minimumLeadingWidth = ScaledMetric(wrappedValue: minimumLeadingWidth, relativeTo: .body)
    }

    var body: some View {
        TrailingDetailLayout(minimumLeadingWidth: minimumLeadingWidth, spacing: spacing) { content }
    }
}

/// A big rounded headline number that grows with Dynamic Type, starting from
/// `size` at the default text size.
private struct StatNumber: ViewModifier {
    @ScaledMetric private var size: CGFloat

    init(size: CGFloat) {
        _size = ScaledMetric(wrappedValue: size, relativeTo: .largeTitle)
    }

    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: .bold, design: .rounded).monospacedDigit())
    }
}

extension View {
    func statNumber(size: CGFloat) -> some View {
        modifier(StatNumber(size: size))
    }

    /// Fills the space as laid out while it fits, and scrolls once larger
    /// text makes it taller, so buttons at the bottom stay reachable.
    func scrollsWhenTall() -> some View {
        GeometryReader { proxy in
            ScrollView {
                // At least the screen's height, so spacers still spread it out.
                self.frame(minHeight: proxy.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}
