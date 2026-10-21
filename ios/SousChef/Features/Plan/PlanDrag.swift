import SwiftUI

/// What can be dragged onto the week planner: a recipe from the library, or a
/// meal already planned, moving to another day or meal. It travels as text so
/// it needs no custom type declaration; any other text dropped is ignored.
nonisolated enum PlanDrag: Equatable, Sendable {
    case recipe(UUID)
    case meal(UUID)

    private static let recipePrefix = "souschef-recipe:"
    private static let mealPrefix = "souschef-meal:"

    var payload: String {
        switch self {
        case .recipe(let id): Self.recipePrefix + id.uuidString
        case .meal(let id): Self.mealPrefix + id.uuidString
        }
    }

    init?(payload: String) {
        let text = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix(Self.recipePrefix), let id = UUID(uuidString: String(text.dropFirst(Self.recipePrefix.count))) {
            self = .recipe(id)
        } else if text.hasPrefix(Self.mealPrefix), let id = UUID(uuidString: String(text.dropFirst(Self.mealPrefix.count))) {
            self = .meal(id)
        } else {
            return nil
        }
    }
}

/// Whether something is being dragged toward the planner, so its empty meals
/// can light up before the drag reaches them.
@Observable
final class PlanDragState {
    static let shared = PlanDragState()
    var isDragging = false
}

extension View {
    /// Lets this view be dragged onto the week planner. Off, it's left alone,
    /// so long presses keep their usual context menu.
    @ViewBuilder
    func plannable<Preview: View>(_ drag: PlanDrag, isEnabled: Bool = true, @ViewBuilder preview: () -> Preview) -> some View {
        if isEnabled {
            draggable(drag.payload, preview: preview).modifier(PlanDragTracker())
        } else {
            self
        }
    }
}

/// Reports drags to `PlanDragState`. Drag sessions arrived in iOS 27; on iOS
/// 26 drops still work, the empty meals just don't light up early.
private struct PlanDragTracker: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 27.0, *) {
            content.onDragSessionUpdated { session in
                let dragging = switch session.phase {
                case .initial, .active: true
                default: false
                }
                if PlanDragState.shared.isDragging != dragging {
                    withAnimation(.smooth(duration: 0.25)) { PlanDragState.shared.isDragging = dragging }
                }
            }
        } else {
            content
        }
    }
}

/// What a recipe looks like under the finger on its way to the planner.
struct PlanDragPreview: View {
    let title: String
    let photo: Data?

    var body: some View {
        HStack(spacing: 10) {
            RecipeImage(data: photo, maxPixel: 200)
                .frame(width: 44, height: 44)
                .clipShape(.rect(cornerRadius: 11, style: .continuous))
            Text(title)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .frame(maxWidth: 180, alignment: .leading)
        }
        .padding(8)
        .padding(.trailing, 6)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.brand.opacity(0.5), lineWidth: 1.5))
    }
}
