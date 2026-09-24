import FoundationModels
import SwiftData
import SwiftUI

/// Gets a recipe draft from a link, pasted text or Apple Intelligence, then
/// hands it to the editor for review. Nothing is saved without that review.
struct RecipeImportView: View {
    enum Mode: String, Identifiable {
        case link, text, photo, ideas
        var id: String { rawValue }
    }

    let mode: Mode
    /// A link or recipe text shared from another app; the import starts
    /// as soon as the sheet appears.
    var shared: String?
    let onDraft: (RecipeDraft) -> Void

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @Query private var pantry: [PantryItem]
    @State private var link = ""
    @State private var text = ""
    @State private var preferences = ""
    @State private var usePantry = true
    @State private var pages: [UIImage] = []
    @State private var working = false
    @State private var error: String?
    @State private var partial: RecipeDraft?
    @State private var task: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    switch mode {
                    case .link: linkForm
                    case .text: textForm
                    case .photo: photoForm
                    case .ideas: ideasForm
                    }
                    if let error { ErrorBanner(message: error) }
                    if let partial, working { PartialRecipePreview(draft: partial) }
                }
                .padding()
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) {
                        task?.cancel()
                        dismiss()
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button(action: start) {
                    Group {
                        if working { ProgressView().tint(.white) } else { Text(actionTitle).font(.headline) }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .disabled(!canStart || working)
                .padding()
                .accessibilityIdentifier("importAction")
            }
        }
        .interactiveDismissDisabled(working)
        .onAppear {
            if let shared {
                if mode == .link { link = shared } else { text = shared }
                start()
            } else if mode == .link, let pasted = UIPasteboard.general.string, pasted.hasPrefix("http") {
                link = pasted
            }
        }
    }

    private var title: String {
        switch mode {
        case .link: "Import from a link"
        case .text: "Paste a recipe"
        case .photo: "Scan a recipe"
        case .ideas: "Recipe ideas"
        }
    }

    private var actionTitle: String {
        switch mode {
        case .link: "Import recipe"
        case .text: "Read recipe"
        case .photo: "Read recipe"
        case .ideas: "Suggest a recipe"
        }
    }

    private var canStart: Bool {
        switch mode {
        case .link: link.nilIfEmpty != nil
        case .text: text.count > 20
        case .photo: !pages.isEmpty
        case .ideas: kitchen.ai.canGenerateRecipes
        }
    }

    private var linkForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow("Recipe page")
            TextField("https://", text: $link)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.title3)
                .padding(14)
                .background(.background.secondary, in: .rect(cornerRadius: 16, style: .continuous))
                .accessibilityIdentifier("importLink")
            Text("Most recipe sites publish structured recipe data, which Sous Chef reads exactly. For other pages, \(kitchen.ai.isAvailable ? "Apple Intelligence reads the page" : "Sous Chef reads the page text"). You'll review everything before saving.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var textForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow("Recipe text")
            TextEditor(text: $text)
                .frame(minHeight: 280)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(.background.secondary, in: .rect(cornerRadius: 16, style: .continuous))
            HStack {
                Button { if let pasted = UIPasteboard.general.string { text = pasted } } label: { Label("Paste", systemImage: "doc.on.clipboard") }
                    .buttonStyle(.glass)
                Spacer()
                AIEngineBadge()
            }
        }
    }

    private var photoForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Eyebrow("Pages", systemImage: "book")
                Spacer()
                AIEngineBadge()
            }
            PhotoStrip(photos: $pages, maxCount: 6, openCameraFirst: true)
            Text("Photograph a cookbook page, or choose photos and screenshots. Add a page for each part if the recipe continues. Sous Chef reads the text on this iPhone\(kitchen.ai.isAvailable ? " with Apple Intelligence" : ""), and you'll review everything before saving.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var ideasForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            Picker("Ideas from", selection: $usePantry) {
                Text("From my pantry").tag(true)
                Text("Anything").tag(false)
            }
            .pickerStyle(.segmented)
            .disabled(!kitchen.ai.isAvailable)
            HStack {
                if usePantry {
                    Eyebrow("Cooking with \(pantry.filter { $0.quantity > 0 }.count) pantry items", systemImage: "cabinet")
                } else {
                    Eyebrow("Any recipe", systemImage: "sparkles")
                }
                Spacer()
                AIEngineBadge()
            }
            TextField(usePantry ? "Anything in mind? e.g. quick vegetarian dinner, no nuts" : "What sounds good? e.g. Thai green curry, crispy tofu, birthday cake",
                      text: $preferences, axis: .vertical)
                .lineLimit(2...4)
                .padding(14)
                .background(.background.secondary, in: .rect(cornerRadius: 16, style: .continuous))
            ScrollView(.horizontal) {
                HStack {
                    ForEach(ideaChips, id: \.self) { idea in
                        Button { preferences = preferences.isEmpty ? idea : "\(preferences), \(idea.lowercased())" } label: { Chip(text: idea, systemImage: "plus") }
                            .buttonStyle(.plain)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .scrollClipDisabled()
            if case .unavailable(let reason) = kitchen.ai.engine {
                ErrorBanner(message: "\(reason). You can also connect your Sous Chef server to use its AI provider.")
            }
            Text("Suggestions are drafts. Check amounts, allergens and cooking times before you cook.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var ideaChips: [String] {
        usePantry ? ["Quick weeknight", "Use what expires soon", "Vegetarian", "High protein", "Comfort food", "Kid friendly"]
            : ["Weeknight dinner", "Date night", "Meal prep", "Vegetarian", "Dessert", "Something new"]
    }

    private func start() {
        error = nil
        working = true
        task = Task {
            defer { working = false }
            do {
                let draft: RecipeDraft
                switch mode {
                case .link:
                    draft = try await RecipeImporter.importRecipe(from: link, ai: kitchen.ai)
                case .text:
                    draft = await RecipeTextReader.read(text, ai: kitchen.ai)
                case .photo:
                    let read = await TextRecognition.text(in: pages)
                    guard read.contains(where: \.isLetter) else {
                        throw KitchenAI.AIError.failed("Sous Chef couldn't find any text. Try a closer, well-lit photo of the page.")
                    }
                    draft = await RecipeTextReader.read(read, ai: kitchen.ai)
                case .ideas:
                    draft = try await kitchen.ai.generateRecipe(pantry: pantry, usePantry: usePantry || !kitchen.ai.isAvailable,
                                                                preferences: preferences) { partial = $0 }
                }
                guard !Task.isCancelled else { return }
                onDraft(draft)
            } catch {
                if !Task.isCancelled { self.error = error.localizedDescription }
            }
        }
    }
}

struct AIEngineBadge: View {
    @Environment(Kitchen.self) private var kitchen
    var body: some View {
        switch kitchen.ai.engine {
        case .privateCloud: Chip(text: "Private Cloud Compute", systemImage: "apple.intelligence")
        case .onDevice: Chip(text: "On-device", systemImage: "apple.intelligence")
        case .companionServer: Chip(text: "Your server", systemImage: "server.rack", tint: .blue)
        case .unavailable: Chip(text: "AI off", systemImage: "apple.intelligence", tint: .secondary)
        }
    }
}

/// The recipe forming live as Apple Intelligence streams it.
struct PartialRecipePreview: View {
    let draft: RecipeDraft

    var body: some View {
        Card {
            HStack {
                Eyebrow("Drafting", systemImage: "apple.intelligence")
                Spacer()
                ProgressView()
            }
            if !draft.title.isEmpty {
                Text(draft.title).font(.title3.weight(.bold)).contentTransition(.opacity)
            }
            if let summary = draft.summary { Text(summary).font(.callout).foregroundStyle(.secondary) }
            ForEach(draft.ingredients) { ingredient in
                Label("\(Units.amount(ingredient.quantity, ingredient.unit)) \(ingredient.name)", systemImage: "circle.fill")
                    .labelStyle(BulletLabelStyle())
                    .font(.callout)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.snappy, value: draft)
    }
}

struct BulletLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.font(.system(size: 5)).foregroundStyle(Color.brand)
            configuration.title
        }
    }
}

struct RecipeChatView: View {
    let recipe: Recipe
    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var session: LanguageModelSession?
    @State private var messages: [Message] = []
    @State private var input = ""
    @State private var responding = false

    struct Message: Identifiable, Equatable {
        let id = UUID()
        var fromUser: Bool
        var text: String
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if messages.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Eyebrow("Ask about \(recipe.title)", systemImage: "apple.intelligence")
                                ForEach(["What can I use instead of an ingredient I'm missing?", "How do I make this ahead?", "How should I scale this for 8 people?"], id: \.self) { suggestion in
                                    Button { send(suggestion) } label: {
                                        Text(suggestion).font(.callout).multilineTextAlignment(.leading)
                                            .padding(12)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .background(Color.brandSoft, in: .rect(cornerRadius: 14, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        ForEach(messages) { message in
                            HStack {
                                if message.fromUser { Spacer(minLength: 40) }
                                Text(message.text.isEmpty ? "…" : message.text)
                                    .padding(12)
                                    .foregroundStyle(message.fromUser ? .white : .primary)
                                    .background(message.fromUser ? Color.brand : Color(uiColor: .secondarySystemBackground), in: .rect(cornerRadius: 18, style: .continuous))
                                if !message.fromUser { Spacer(minLength: 40) }
                            }
                            .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: messages) { _, messages in
                    if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            .safeAreaInset(edge: .bottom) {
                HStack {
                    TextField("Ask Sous Chef", text: $input, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .glassEffect(.regular, in: .rect(cornerRadius: 22))
                        .onSubmit { send(input) }
                    Button { send(input) } label: {
                        Image(systemName: "arrow.up").font(.headline).frame(width: 36, height: 36)
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.circle)
                    .disabled(input.nilIfEmpty == nil || responding)
                }
                .padding()
            }
            .navigationTitle("Ask Sous Chef")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", role: .close) { dismiss() } }
            }
            .onAppear { session = kitchen.ai.makeRecipeChat(for: recipe) }
        }
    }

    private func send(_ text: String) {
        guard let prompt = text.nilIfEmpty, let session, !responding else { return }
        input = ""
        messages.append(Message(fromUser: true, text: prompt))
        messages.append(Message(fromUser: false, text: ""))
        let index = messages.count - 1
        responding = true
        Task {
            defer { responding = false }
            do {
                for try await snapshot in session.streamResponse(to: prompt) {
                    messages[index].text = snapshot.content
                }
            } catch {
                messages[index].text = "Sorry, I couldn't answer that. Try asking another way."
            }
        }
    }
}
