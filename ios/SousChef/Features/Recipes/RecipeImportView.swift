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

    /// What's been typed, pasted or photographed. It belongs to the flow, so
    /// backing out of the review editor returns to the same prompt.
    struct Input {
        var link = ""
        var text = ""
        var preferences = ""
        var pages: [UIImage] = []
    }

    let mode: Mode
    @Binding var input: Input
    /// A link or recipe text shared from another app: the import starts as
    /// soon as the sheet appears.
    var startsImmediately = false
    let onDraft: (RecipeDraft) -> Void

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @Query private var pantry: [PantryItem]
    @AppStorage("ideas.usePantry") private var usePantry = true
    @State private var working = false
    @State private var error: String?
    @State private var partial: RecipeDraft?
    /// A link that can't be imported as typed; retrying it won't help, so the
    /// bottom button offers Cancel until the link changes.
    @State private var deadLink: String?
    @State private var task: Task<Void, Never>?
    /// Counts runs, so a stopped run finishing late can't end a newer one.
    @State private var run = 0

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        switch mode {
                        case .link: linkForm
                        case .text: textForm
                        case .photo: photoForm
                        case .ideas: ideasForm
                        }
                        if let error { ErrorBanner(message: error) }
                        if working, mode == .ideas {
                            PartialRecipePreview(draft: partial)
                                .id("preview")
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                    }
                    .padding()
                    .animation(.smooth, value: working)
                }
                .onChange(of: working) { _, working in
                    guard working, mode == .ideas else { return }
                    withAnimation(.smooth) { proxy.scrollTo("preview", anchor: .top) }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .close) {
                        task?.cancel()
                        dismiss()
                    }
                    .accessibilityIdentifier("closeImport")
                }
            }
            .safeAreaInset(edge: .bottom) {
                Group {
                    if showsCancel {
                        Button(role: .cancel) { dismiss() } label: {
                            Text("Cancel").font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.glass)
                    } else if working {
                        // Stopping lives on the button that's showing progress,
                        // and keeps the prompt so it can be tweaked and retried.
                        Button(action: stop) {
                            HStack(spacing: 10) {
                                ProgressView()
                                    .accessibilityHidden(true)
                                Text(workingTitle)
                                Spacer(minLength: 8)
                                Label("Stop", systemImage: "stop.fill")
                                    .foregroundStyle(.red)
                            }
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.glass)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Stop")
                        .accessibilityValue(workingTitle)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier("stopImport")
                    } else {
                        Button(action: start) {
                            Text(actionTitle).font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.glassProminent)
                        .disabled(!canStart)
                        .accessibilityIdentifier("importAction")
                    }
                }
                .padding()
            }
        }
        .interactiveDismissDisabled(working)
        .onAppear {
            if startsImmediately {
                start()
            } else if mode == .link, input.link.isEmpty, let pasted = UIPasteboard.general.string, pasted.hasPrefix("http") {
                input.link = pasted
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

    private var workingTitle: String {
        switch mode {
        case .link: "Importing\u{2026}"
        case .text, .photo: "Reading\u{2026}"
        case .ideas: "Drafting\u{2026}"
        }
    }

    private var showsCancel: Bool {
        mode == .link && !working && deadLink != nil && deadLink == input.link
    }

    private var canStart: Bool {
        switch mode {
        case .link: input.link.nilIfEmpty != nil
        case .text: input.text.count > 20
        case .photo: !input.pages.isEmpty
        case .ideas: kitchen.ai.canGenerateRecipes
        }
    }

    private var linkForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Eyebrow("Recipe page")
            TextField("https://", text: $input.link)
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
            TextEditor(text: $input.text)
                .frame(minHeight: 280)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(.background.secondary, in: .rect(cornerRadius: 16, style: .continuous))
            AdaptiveStack(verticalSpacing: 8) {
                Button { if let pasted = UIPasteboard.general.string { input.text = pasted } } label: { Label("Paste", systemImage: "doc.on.clipboard") }
                    .buttonStyle(.glass)
                    .frame(maxWidth: .infinity, alignment: .leading)
                AIEngineBadge()
            }
        }
    }

    private var photoForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            AdaptiveStack(verticalSpacing: 6) {
                Eyebrow("Pages", systemImage: "book")
                    .frame(maxWidth: .infinity, alignment: .leading)
                AIEngineBadge()
            }
            PhotoStrip(photos: $input.pages, maxCount: 6, openCameraFirst: true)
            Text("Photograph a cookbook page, or choose photos and screenshots. Add a page for each part if the recipe continues. Sous Chef reads the text on this device\(kitchen.ai.isAvailable ? " with Apple Intelligence" : ""), and you'll review everything before saving.")
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
            AdaptiveStack(verticalSpacing: 6) {
                Group {
                    if usePantry {
                        Eyebrow("Cooking with \(pantry.filter { $0.quantity > 0 }.count) pantry items", systemImage: "cabinet")
                    } else {
                        Eyebrow("Any recipe", systemImage: "sparkles")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                AIEngineBadge()
            }
            TextField(usePantry ? "Anything in mind? e.g. quick vegetarian dinner, no nuts" : "What sounds good? e.g. Thai green curry, crispy tofu, birthday cake",
                      text: $input.preferences, axis: .vertical)
                .lineLimit(2...4)
                .padding(14)
                .background(.background.secondary, in: .rect(cornerRadius: 16, style: .continuous))
            ScrollView(.horizontal) {
                HStack {
                    ForEach(ideaChips, id: \.self) { idea in
                        Button { input.preferences = input.preferences.isEmpty ? idea : "\(input.preferences), \(idea.lowercased())" } label: { Chip(text: idea, systemImage: "plus") }
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

    private func stop() {
        task?.cancel()
        task = nil
        run += 1
        withAnimation(.smooth) { working = false }
    }

    private func start() {
        error = nil
        deadLink = nil
        working = true
        run += 1
        let thisRun = run
        task = Task {
            defer { if run == thisRun { working = false } }
            do {
                let draft: RecipeDraft
                switch mode {
                case .link:
                    draft = try await RecipeImporter.importRecipe(from: input.link, ai: kitchen.ai)
                case .text:
                    draft = await RecipeTextReader.read(input.text, ai: kitchen.ai)
                case .photo:
                    let read = await TextRecognition.recipeText(in: input.pages)
                    guard read.contains(where: \.isLetter) else {
                        throw KitchenAI.AIError.failed("Sous Chef couldn't find any text. Try a closer, well-lit photo of the page.")
                    }
                    draft = await RecipeTextReader.read(read, ai: kitchen.ai)
                case .ideas:
                    partial = nil
                    draft = try await kitchen.ai.generateRecipe(pantry: pantry, usePantry: usePantry || !kitchen.ai.isAvailable,
                                                                preferences: input.preferences) { partial = $0 }
                }
                guard !Task.isCancelled else { return }
                onDraft(draft)
            } catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
                switch error as? RecipeImporter.ImportError {
                case .noRecipe, .badURL: deadLink = input.link
                default: break
                }
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

/// The recipe forming live as Apple Intelligence streams it. Text fills in
/// place (no crossfades, which flicker as each word arrives); only new
/// ingredient rows animate in, and placeholder bars hold the shape until
/// the first words arrive.
struct PartialRecipePreview: View {
    let draft: RecipeDraft?

    var body: some View {
        Card {
            HStack(spacing: 8) {
                Image(systemName: "apple.intelligence")
                    .symbolEffect(.pulse, options: .repeating)
                    .foregroundStyle(Color.brand)
                Eyebrow("Drafting your recipe")
                Spacer()
            }
            if let title = draft?.title.nilIfEmpty {
                Text(title).font(.title3.weight(.bold))
            } else {
                placeholder(width: 0.6, height: 22)
            }
            if let summary = draft?.summary?.nilIfEmpty {
                Text(summary).font(.callout).foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    placeholder(width: 0.95)
                    placeholder(width: 0.7)
                }
            }
            let ingredients = draft?.ingredients ?? []
            if !ingredients.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    // By position: each streamed update makes new ingredient
                    // values, and matching them by id made rows cross-fade over each other.
                    ForEach(Array(ingredients.enumerated()), id: \.offset) { _, ingredient in
                        Label("\(Units.amount(ingredient.quantity, ingredient.unit)) \(ingredient.name)", systemImage: "circle.fill")
                            .labelStyle(BulletLabelStyle())
                            .font(.callout)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
            }
        }
        .animation(.smooth, value: draft?.ingredients.count ?? 0)
        .animation(.smooth, value: draft?.title.isEmpty ?? true)
        .animation(.smooth, value: draft?.summary == nil)
    }

    private func placeholder(width: CGFloat, height: CGFloat = 12) -> some View {
        Capsule()
            .fill(.quaternary)
            .frame(height: height)
            .frame(maxWidth: .infinity, alignment: .leading)
            .scaleEffect(x: width, anchor: .leading)
            .phaseAnimator([0.45, 1]) { bar, opacity in bar.opacity(opacity) } animation: { _ in .easeInOut(duration: 0.9) }
    }
}

/// Imports or drafts a recipe, then reviews it in the editor inside the same
/// sheet: the finished draft turns into the editor instead of one sheet
/// sliding away and another sliding up.
struct RecipeImportFlow: View {
    let mode: RecipeImportView.Mode
    var onSave: (Recipe) -> Void
    @State private var draft: RecipeDraft?
    @State private var input: RecipeImportView.Input
    /// A shared link or text imports once; coming back from the editor
    /// shows it in the form instead of importing it again.
    @State private var startsImmediately: Bool

    /// - Parameter shared: a link or recipe text shared from another app.
    init(mode: RecipeImportView.Mode, shared: String? = nil, onSave: @escaping (Recipe) -> Void = { _ in }) {
        self.mode = mode
        self.onSave = onSave
        var input = RecipeImportView.Input()
        if let shared {
            if mode == .link { input.link = shared } else { input.text = shared }
        }
        _input = State(initialValue: input)
        _startsImmediately = State(initialValue: shared != nil)
    }

    var body: some View {
        ZStack {
            if let draft {
                // Cancel goes back to the prompt, link or text that made
                // this draft rather than closing the sheet.
                RecipeEditorView(draft: draft, recipe: nil, onSave: onSave) {
                    withAnimation(.smooth(duration: 0.45)) { self.draft = nil }
                }
                .transition(.blurReplace)
            } else {
                RecipeImportView(mode: mode, input: $input, startsImmediately: startsImmediately) { draft in
                    startsImmediately = false
                    withAnimation(.smooth(duration: 0.45)) { self.draft = draft }
                }
                .transition(.blurReplace)
            }
        }
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
        // Another device may delete the recipe while this is open.
        DeletedElsewhereGuard(recipe) { screen }
    }

    private var screen: some View {
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
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark", role: .close) { dismiss() }
                }
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
