import SwiftUI

/// Two panes meeting at the fold of an iPhone Duo, or at the middle of any
/// other screen, so nothing sits on the crease. Side by side when the phone
/// lies open on its side; one above the other when it's held upright or
/// propped half open like a laptop.
struct TwoPane<Primary: View, Secondary: View>: View {
    var axis: Axis = .horizontal
    /// A pane given the whole window while the other steps aside, keeping its
    /// state for when it comes back.
    var expanded: Pane?
    @ViewBuilder var primary: Primary
    @ViewBuilder var secondary: Secondary

    enum Pane { case primary, secondary }

    var body: some View {
        GeometryReader { proxy in
            let split = Self.split(in: proxy, axis: axis)
            let full = axis == .horizontal ? proxy.size.width : proxy.size.height
            let first: CGFloat = switch expanded {
            case .primary: full
            case .secondary: 0
            case nil: split.primary
            }
            let gutter = expanded == nil ? split.gutter : 0
            let horizontal = axis == .horizontal
            // One layout for both directions keeps the panes, and whatever
            // they have open, as the phone turns.
            let stack = horizontal ? AnyLayout(HStackLayout(spacing: gutter)) : AnyLayout(VStackLayout(spacing: gutter))
            let rest: CGFloat = expanded == .primary ? 0 : .infinity
            stack {
                stepsAside(primary.frame(width: horizontal ? first : nil, height: horizontal ? nil : first), when: .secondary)
                stepsAside(secondary.frame(maxWidth: horizontal ? rest : .infinity, maxHeight: horizontal ? .infinity : rest), when: .primary)
            }
        }
    }

    /// Hides a pane while the other one has the whole window.
    private func stepsAside(_ pane: some View, when other: Pane) -> some View {
        let aside = expanded == other
        return pane
            .opacity(aside ? 0 : 1)
            .allowsHitTesting(!aside)
            .accessibilityHidden(aside)
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
    /// For the content of a leading pane that has its own NavigationStack.
    /// The stack still insets its content for the unfolded Duo's tab rail at
    /// the far edge of the window, leaving a gap before the fold.
    func ignoresRailInset() -> some View {
        ignoresSafeArea(.container, edges: .trailing)
    }

    /// Tracks whether this view has room for two panes, and which way they
    /// meet: side by side on the unfolded iPhone Duo held sideways, an iPad,
    /// a Mac or a phone on its side; one above the other on the unfolded Duo
    /// held upright, where the fold runs across the window.
    func tracksPaneLayout(_ layout: Binding<PaneLayout>) -> some View {
        onGeometryChange(for: PaneLayout.self) { PaneLayout(in: $0) } action: { layout.wrappedValue = $0 }
    }
}

/// Lays out its content for the window it's in from the first frame, for a
/// screen that opens mid-session and shouldn't be seen switching layouts.
struct PaneLayoutReader<Content: View>: View {
    @ViewBuilder var content: (PaneLayout) -> Content

    var body: some View {
        GeometryReader { proxy in
            content(PaneLayout(in: proxy))
        }
    }
}

/// How a screen lays out its panes for the window it's in.
nonisolated enum PaneLayout: Equatable, Sendable {
    /// One column: a phone, or a narrow window.
    case single
    /// Two panes side by side, meeting at a fold that runs top to bottom or
    /// at the middle of a wide screen.
    case sideBySide
    /// Two panes one above the other, meeting at a fold that runs across:
    /// the unfolded iPhone Duo held upright.
    case stacked

    var isSplit: Bool { self != .single }

    init(in proxy: GeometryProxy) {
        var foldRunsAcross: Bool?
        #if canImport(SwiftUI, _version: 8.0.85)
        if #available(iOS 27.1, *),
           let fold = proxy.reservedRegions(kind: .division, options: .includeInactive).first {
            foldRunsAcross = fold.frame.width > fold.frame.height
        }
        #endif
        self = .resolve(size: proxy.size, foldRunsAcross: foldRunsAcross)
    }

    /// Side by side from 700 points wide. Narrower, only a fold running across
    /// a window wide enough for a two-column pane stacks them; without a fold
    /// a tall, narrow window stays one column.
    static func resolve(size: CGSize, foldRunsAcross: Bool?) -> PaneLayout {
        if size.width >= 700 { return .sideBySide }
        if size.width >= 600, foldRunsAcross == true { return .stacked }
        return .single
    }
}

/// A screen's main content with a companion pane on the other half of an
/// unfolded iPhone Duo, the companion first either way: leading when the
/// halves sit side by side, and on top when they're stacked. Stacked, the top
/// half stands up facing the cook when the phone is propped like a laptop, so
/// it holds what's there to read, and the half lying on the counter holds the
/// list to scroll and tap.
struct CompanionSplit<Main: View, Companion: View>: View {
    var layout: PaneLayout
    /// The main content's navigation path, for content that goes deeper than
    /// its list. Stacked, a half is too short for a recipe, so once the path
    /// isn't empty the main content takes both halves.
    var path: Binding<NavigationPath>?
    /// Builds the main content around the path its navigation stack shows.
    @ViewBuilder var main: (Binding<NavigationPath>) -> Main
    @ViewBuilder var companion: Companion
    /// What the main content's navigation stack shows. Going deeper from the
    /// stacked list, it follows the path a moment later: the pane takes both
    /// halves first, since a stack keeps its old size until a push finishes.
    @State private var shownPath = NavigationPath()
    /// Keeps both halves for the main content while it slides back to its
    /// list, so the pane only shrinks once the list is showing.
    @State private var leavingDeeper = false

    init(layout: PaneLayout, @ViewBuilder main: @escaping () -> Main, @ViewBuilder companion: () -> Companion) {
        self.layout = layout
        self.main = { _ in main() }
        self.companion = companion()
    }

    init(layout: PaneLayout, path: Binding<NavigationPath>, @ViewBuilder main: @escaping (Binding<NavigationPath>) -> Main, @ViewBuilder companion: () -> Companion) {
        self.layout = layout
        self.path = path
        self.main = main
        self.companion = companion()
    }

    private var mainIsDeeper: Bool { !(path?.wrappedValue.isEmpty ?? true) }

    /// Whether the stack waits for the pane to take both halves before
    /// showing a new path.
    private func waits(for new: NavigationPath) -> Bool {
        layout == .stacked && shownPath.isEmpty && !new.isEmpty
    }

    var body: some View {
        Group {
            switch layout {
            case .single:
                main(path ?? .constant(NavigationPath()))
            case .sideBySide, .stacked:
                let stacked = layout == .stacked
                let expanded = stacked && (mainIsDeeper || leavingDeeper)
                TwoPane(axis: stacked ? .vertical : .horizontal, expanded: expanded ? .secondary : nil) {
                    companion.environment(\.isStackedPane, stacked)
                } secondary: {
                    main(Binding {
                        shownPath
                    } set: { new in
                        shownPath = new
                        path?.wrappedValue = new
                    })
                    .environment(\.deeperScreensStack, stacked)
                    // The tab bar sits over the lower half, so it collapses
                    // as that half scrolls rather than the top one.
                    .background {
                        if stacked { TabBarScrollProbe(screen: shownPath.count) }
                    }
                    // Opened from the list, a screen waits for the pane to
                    // grow, which a NavigationLink can't.
                    .environment(\.openDeeper, stacked ? OpenDeeper { change in
                        guard let path else { return }
                        change(&path.wrappedValue)
                    } : nil)
                }
            }
        }
        .onChange(of: path?.wrappedValue, initial: true) { _, new in
            guard let new, new != shownPath else { return }
            if !waits(for: new) {
                shownPath = new
                return
            }
            Task {
                // A frame for the pane to take both halves.
                try? await Task.sleep(for: .milliseconds(30))
                if path?.wrappedValue == new { shownPath = new }
            }
        }
        .onChange(of: mainIsDeeper) { _, deeper in
            if deeper { leavingDeeper = true }
        }
        .task(id: mainIsDeeper) {
            guard !mainIsDeeper, leavingDeeper else { return }
            // About as long as a navigation stack takes to pop.
            try? await Task.sleep(for: .milliseconds(450))
            guard !Task.isCancelled else { return }
            withAnimation(.snappy) { leavingDeeper = false }
        }
    }
}

extension EnvironmentValues {
    /// True for a companion pane on one half of a stacked split: wide and
    /// short, so it keeps its title small and lays its cards out in columns.
    @Entry var isStackedPane = false
    /// True for the main content of a stacked split, where a screen opened
    /// from its list takes both halves and lays out one above the other.
    /// Set from outside rather than measured, since a screen sliding in or
    /// out can't see the fold.
    @Entry var deeperScreensStack = false
    /// Opens a screen deeper than a stacked split's list; nil elsewhere.
    @Entry var openDeeper: OpenDeeper?
}

/// Opens a screen deeper than a stacked split's list by changing its path,
/// so the pane can take both halves before the screen slides in.
struct OpenDeeper {
    var change: (_ update: (inout NavigationPath) -> Void) -> Void

    func callAsFunction(_ value: some Hashable) {
        change { $0.append(value) }
    }
}

/// A link to a screen deeper than a list that may be on one half of a
/// stacked split. There it opens the screen through the split, and shows a
/// chevron like a list's link when asked; elsewhere it's a NavigationLink.
struct PaneLink<Value: Hashable, Label: View>: View {
    var value: Value
    var chevron = false
    @ViewBuilder var label: Label
    @Environment(\.openDeeper) private var openDeeper

    var body: some View {
        if let openDeeper {
            Button {
                openDeeper(value)
            } label: {
                HStack {
                    label
                    if chevron {
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.forward")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                }
                .contentShape(.rect)
            }
            // Keeps the label's own colours rather than the tint.
            .buttonStyle(.plain)
        } else {
            NavigationLink(value: value) { label }
        }
    }
}

extension View {
    /// The title display for a navigation stack on one half of a stacked
    /// split: inline, leaving the half for its content.
    func paneTitleDisplayMode(_ stacked: Bool) -> some View {
        navigationBarTitleDisplayMode(stacked ? .inline : .automatic)
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

/// A companion pane's cards: one column, or two side by side on a stacked
/// half, which is wide and short. The leading cards come first in one column.
struct PaneCards<Leading: View, Trailing: View>: View {
    var columns: Bool
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        if columns {
            HStack(alignment: .top, spacing: 14) {
                VStack(spacing: 14) { leading }
                VStack(spacing: 14) { trailing }
            }
        } else {
            VStack(spacing: 14) {
                leading
                trailing
            }
        }
    }
}

/// Hands the tab bar the scroll view to collapse with: the one in the probe's
/// pane that reaches furthest down, nearest the tab bar. Left to itself,
/// UIKit picks the first it finds, on the upper half of a stacked split.
private struct TabBarScrollProbe: UIViewRepresentable {
    /// Changes as screens are pushed and popped, to look again.
    var screen: Int

    func makeUIView(context: Context) -> Probe { Probe() }

    func updateUIView(_ probe: Probe, context: Context) {
        probe.attachSoon()
    }

    final class Probe: UIView {
        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
        }

        required init?(coder: NSCoder) { nil }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            attachSoon()
        }

        /// After a push or pop has put the new screen's scroll views in place.
        func attachSoon() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in self?.attach() }
        }

        private func attach() {
            guard let window, let tab = tabViewController else { return }
            let pane = convert(bounds, to: window)
            var best: (scrollView: UIScrollView, bottom: CGFloat, area: CGFloat)?
            for scrollView in scrollViews(in: window) where scrollView.window != nil && !scrollView.isHidden && scrollView.alpha > 0 {
                let frame = scrollView.convert(scrollView.bounds, to: window).intersection(pane)
                guard !frame.isNull, frame.height > 80 else { continue }
                let area = frame.width * frame.height
                if best == nil || frame.maxY > best!.bottom + 1 || (abs(frame.maxY - best!.bottom) <= 1 && area > best!.area) {
                    best = (scrollView, frame.maxY, area)
                }
            }
            guard let best, tab.contentScrollView(for: .bottom) !== best.scrollView else { return }
            tab.setContentScrollView(best.scrollView, for: .bottom)
        }

        /// The view controller for this tab: the child of the tab bar
        /// controller that holds the probe.
        private var tabViewController: UIViewController? {
            var responder: UIResponder? = self
            while let current = responder, !(current is UIViewController) { responder = current.next }
            var controller = responder as? UIViewController
            while let current = controller, !(current.parent is UITabBarController) { controller = current.parent }
            return controller
        }

        private func scrollViews(in view: UIView) -> [UIScrollView] {
            view.subviews.flatMap { subview in
                (subview as? UIScrollView).map { [$0] + scrollViews(in: $0) } ?? scrollViews(in: subview)
            }
        }
    }
}
