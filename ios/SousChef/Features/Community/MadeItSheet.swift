import SwiftUI

/// "I made this": a 1–5 star rating and an optional tip for other cooks.
struct MadeItSheet: View {
    static let tipLimit = 280

    let title: String
    /// The person's earlier rating, when they're changing it.
    let existing: Community.Detail.Viewer.Made?
    let submit: (Int, String?) async throws -> Void
    let remove: () async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var rating = 0
    @State private var tip = ""
    @State private var working = false
    @State private var error: String?
    @State private var confirmRemove = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 6) {
                        StarRatingPicker(rating: $rating)
                        Text(Self.caption(for: rating)).font(.footnote).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                } header: {
                    Eyebrow("How did it turn out?")
                }
                Section {
                    TextField("Share a tip (optional)", text: $tip, axis: .vertical)
                        .lineLimit(3...8)
                        .onChange(of: tip) { _, value in
                            if value.count > Self.tipLimit { tip = String(value.prefix(Self.tipLimit)) }
                        }
                        .accessibilityIdentifier("madeTip")
                    Text("\(tip.count)/\(Self.tipLimit)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(tip.count >= Self.tipLimit ? Color.orange : Color.secondary)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .accessibilityLabel("\(tip.count) of \(Self.tipLimit) characters")
                        .accessibilityIdentifier("madeTipCount")
                } header: {
                    Eyebrow("Tip")
                } footer: {
                    Text("Your rating and tip are public and show your community name. What you post must follow the community guidelines.")
                }
                if let error {
                    Section { ErrorBanner(message: error).accessibilityIdentifier("madeError") }
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
                if existing != nil {
                    Section {
                        Button("Remove my rating", systemImage: "trash", role: .destructive) { confirmRemove = true }
                            .tint(.red)
                            .disabled(working)
                            .accessibilityIdentifier("madeRemove")
                    }
                }
            }
            .navigationTitle(existing == nil ? "I made this" : "Edit your rating")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if working {
                        ProgressView()
                    } else {
                        Button(existing == nil ? "Post" : "Save", role: .confirm) { Task { await post() } }
                            .disabled(rating == 0)
                            .accessibilityIdentifier("madePost")
                    }
                }
            }
            .interactiveDismissDisabled(working)
            .onAppear {
                rating = existing?.rating ?? 0
                tip = existing?.tip ?? ""
            }
            .sheet(isPresented: $confirmRemove) {
                ConfirmSheet(systemImage: "trash", title: "Remove your rating?",
                             message: "Your rating and tip for \(title) are removed from the community.",
                             action: "Remove rating", actionIdentifier: "madeConfirmRemove") {
                    Task { await delete() }
                }
            }
        }
        .presentationBackground(Color(.systemGroupedBackground))
    }

    static func caption(for rating: Int) -> String {
        switch rating {
        case 1: "Wouldn't make it again"
        case 2: "Not for me"
        case 3: "It was fine"
        case 4: "Really good"
        case 5: "Loved it"
        default: "Tap a star to rate"
        }
    }

    private func post() async {
        await run { try await submit(rating, tip.nilIfEmpty) }
    }

    private func delete() async {
        await run(remove)
    }

    private func run(_ action: () async throws -> Void) async {
        working = true
        error = nil
        defer { working = false }
        do {
            try await action()
            dismiss()
        } catch {
            // Word-filter refusals and the like stay here, next to the text.
            self.error = error.localizedDescription
        }
    }
}

/// The person's own rating on a recipe's page, or the way to add one.
struct CommunityMadeCard: View {
    let model: CommunityRecipeModel
    let rate: () -> Void

    var body: some View {
        Card {
            if let made = model.made {
                Eyebrow("You made this", systemImage: "checkmark.seal")
                StarRating(rating: Double(made.rating)).font(.title3)
                if let tip = made.tip?.nilIfEmpty { Text(tip).font(.callout) }
                Button("Edit your rating", systemImage: "pencil", action: rate)
                    .buttonStyle(.glass)
                    .accessibilityIdentifier("communityEditMade")
            } else {
                Eyebrow("Cooked it?", systemImage: "frying.pan")
                Text("Rate this recipe and leave a tip for the next cook.").font(.callout).foregroundStyle(.secondary)
                Button(action: rate) {
                    Label("I made this", systemImage: "checkmark.seal").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 2)
                }
                .buttonStyle(.glass)
                .accessibilityIdentifier("communityMadeIt")
            }
        }
    }
}
