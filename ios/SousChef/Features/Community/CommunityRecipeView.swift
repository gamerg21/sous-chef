import SwiftUI

/// A community recipe's page.
struct CommunityRecipeView: View {
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityModeration.self) private var moderation
    @Environment(CommunityClient.self) private var client
    @Environment(CommunitySocial.self) private var social
    @Environment(\.dismiss) private var dismiss
    @State private var model: CommunityRecipeModel
    @State private var reporting: CommunityReportTarget?
    @State private var blocking: Community.Author?
    @State private var rating = false
    @State private var saveError: String?
    @State private var confirmingRemoval = false
    @State private var removeError: String?
    /// The kitchen recipe whose sharing is being edited.
    @State private var editingSharing: Recipe?

    init(id: String, preview: Community.Listing?) {
        _model = State(initialValue: CommunityRecipeModel(id: id, preview: preview))
    }

    private var hidden: Bool {
        if moderation.hiddenRecipes[model.id] != nil { return true }
        if let detail = model.detail { return !model.isOwn && moderation.isHidden(detail) }
        if let preview = model.preview { return moderation.isHidden(preview) }
        return false
    }

    var body: some View {
        Group {
            if !moderation.hasAcceptedGuidelines {
                // A share link can land here before the person has agreed.
                ScrollView { CommunityGuidelinesCard().padding() }
            } else if hidden {
                ContentUnavailableView("Recipe hidden", systemImage: "eye.slash",
                                       description: Text("This recipe is hidden for you. You can manage hidden recipes and blocked cooks in Settings."))
            } else {
                switch model.phase {
                case .notFound:
                    ContentUnavailableView("Recipe not found", systemImage: "questionmark.folder",
                                           description: Text("This recipe isn't in the community any more. Its cook may have removed it or made it private."))
                case .failed(let message) where model.listing == nil:
                    ContentUnavailableView {
                        Label("Couldn't open this recipe", systemImage: "wifi.slash")
                    } description: {
                        Text(message)
                    } actions: {
                        Button("Try again", systemImage: "arrow.clockwise") { Task { await model.load() } }
                            .buttonStyle(.glassProminent)
                    }
                default:
                    if let listing = model.listing {
                        CommunityRecipeContent(model: model, listing: listing, saveError: saveError,
                                               report: { reporting = $0 }, block: { blocking = $0 }, rate: rate)
                    } else {
                        ProgressView("Loading recipe…")
                    }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .safeAreaInset(edge: .bottom) { if showsSaveBar { saveBar } }
        .task(id: LoadKey(identity: social.identity, accepted: moderation.hasAcceptedGuidelines)) {
            guard moderation.hasAcceptedGuidelines else { return }
            await model.load()
        }
        // Outside the branches so the sheets survive the recipe being hidden.
        .sheet(item: $reporting, onDismiss: { if hidden { dismiss() } }) { target in
            CommunityReportSheet(target: target) {
                if let tip = target.tip { model.markReported(tip) }
            }
            .kitchenEnvironment(kitchen)
        }
        .blockCookConfirmation(for: $blocking) { if hidden { dismiss() } }
        .sheet(isPresented: $rating) {
            MadeItSheet(title: model.listing?.title ?? "", existing: model.made,
                        submit: { try await model.submitMade(rating: $0, tip: $1) },
                        remove: { try await model.removeMade() })
                .kitchenEnvironment(kitchen)
        }
        .sheet(isPresented: $confirmingRemoval) {
            ConfirmSheet(systemImage: "eye.slash", title: "Unpublish this recipe?",
                         message: "\(model.listing?.title ?? "This recipe") will no longer appear in Community, and its link stops working. Copies people already saved stay with them. You can share it again later.",
                         action: "Unpublish", actionIdentifier: "confirmRemoveFromCommunity") {
                Task { await remove() }
            }
        }
        .sheet(item: $editingSharing, onDismiss: { Task { await sharingEdited() } }) { recipe in
            PublishRecipeSheet(recipe: recipe).kitchenEnvironment(kitchen)
        }
        .alert("Couldn't remove this recipe", isPresented: Binding { removeError != nil } set: { if !$0 { removeError = nil } }) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(removeError ?? "")
        }
    }

    private func remove() async {
        do {
            try await model.remove()
            dismiss()
        } catch {
            removeError = error.localizedDescription
        }
    }

    /// The publish sheet may have taken the recipe down, or changed who can see it.
    private func sharingEdited() async {
        do {
            _ = try await client.detail(id: model.id)
            await model.load()
        } catch CommunityError.notFound {
            social.markRemoved(model.id)
            dismiss()
        } catch {
            // Offline: what's on screen stays.
        }
    }

    private struct LoadKey: Hashable {
        var identity: String
        var accepted: Bool
    }

    private var showsSaveBar: Bool {
        moderation.hasAcceptedGuidelines && !hidden && model.detail != nil
    }

    private func rate() {
        guard social.requireAccount() else { return }
        rating = true
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if moderation.hasAcceptedGuidelines, !hidden, let listing = model.listing {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if let share = listing.shareUrl.flatMap(URL.init(string:)) {
                    ShareLink(item: share, subject: Text(listing.title), message: Text("\(listing.title) on Sous Chef")) {
                        Label("Share", systemImage: "square.and.arrow.up")
                    }
                    .accessibilityIdentifier("communityShare")
                }
                if model.isOwn {
                    // The person's own recipe: no reporting or blocking, but a way to take it down.
                    if model.canRemove {
                        Menu {
                            if let recipe = model.sharedFrom {
                                Button("Edit sharing", systemImage: "slider.horizontal.3") { editingSharing = recipe }
                                    .accessibilityIdentifier("communityEditSharing")
                            }
                            Button("Unpublish", systemImage: "eye.slash", role: .destructive) { confirmingRemoval = true }
                                .tint(.red)
                                .accessibilityIdentifier("communityRemoveRecipe")
                        } label: {
                            Label("More", systemImage: "ellipsis")
                        }
                        .accessibilityIdentifier("communityOwnRecipeMenu")
                    }
                } else {
                    Menu {
                        CommunityRecipeMenuItems(listing: listing,
                                                 report: { reporting = CommunityReportTarget(listing: listing) },
                                                 block: { blocking = listing.author })
                    } label: {
                        Label("More", systemImage: "ellipsis")
                    }
                    .accessibilityIdentifier("communityRecipeMenu")
                }
            }
        }
    }

    private var saveBar: some View {
        VStack(spacing: 8) {
            if let saveError { ErrorBanner(message: saveError) }
            if model.isSaved {
                Button(action: openSaved) {
                    Label(model.savedRecipe == nil ? "Saved to your recipes" : "Saved · Open in your recipes", systemImage: "checkmark.circle.fill")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.glass)
                .disabled(model.savedRecipe == nil)
                .accessibilityIdentifier("communityOpenSaved")
            } else {
                Button(action: save) {
                    Group {
                        if model.saving { ProgressView() } else { Label("Save to my recipes", systemImage: "square.and.arrow.down") }
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .disabled(model.saving)
                .accessibilityIdentifier("communitySave")
            }
        }
        .frame(maxWidth: CommunityRecipeContent.readableWidth)
        .padding()
        // A bar stays a bar: beyond this size it would cover the recipe it floats over.
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
    }

    private func save() {
        Task {
            do {
                try await model.save()
                saveError = nil
            } catch {
                saveError = error.localizedDescription
            }
        }
    }

    private func openSaved() {
        guard let recipe = model.savedRecipe else { return }
        AppNavigator.shared.open(recipe: recipe.uuid)
    }
}
