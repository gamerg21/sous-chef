import MessageUI
import SwiftUI

/// Community rules shown before any community content, and before publishing.
struct CommunityGuidelinesCard: View {
    @Environment(CommunityModeration.self) private var moderation

    private static let rules: [(String, String)] = [
        ("hand.raised", "No hateful, harassing, sexual, violent or illegal content."),
        ("xmark.bin", "No spam, scams or misleading food safety advice."),
        ("globe", "Recipes you share are public and can be saved by anyone."),
        ("flag", "Reports are reviewed within 24 hours. Offending recipes are removed and the cooks who post them are banned."),
    ]

    var body: some View {
        Card {
            HStack(spacing: 12) {
                IconBadge(systemImage: "person.2")
                VStack(alignment: .leading, spacing: 2) {
                    Eyebrow("Before you join")
                    Text("Community guidelines").font(.title3.weight(.bold))
                }
            }
            Text("Sous Chef has zero tolerance for objectionable content or abusive cooks.")
                .foregroundStyle(.secondary)
            ForEach(Self.rules, id: \.1) { symbol, text in
                Label { Text(text) } icon: { Image(systemName: symbol).foregroundStyle(Color.brand).frame(width: 24) }
                    .font(.callout)
            }
            Text("You can report a recipe or block its cook from the recipe's menu.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Link(destination: CommunityModeration.guidelinesURL) {
                Label("Read the full guidelines", systemImage: "arrow.up.right.square")
            }
            .font(.callout.weight(.medium))
            Button {
                withAnimation { moderation.acceptGuidelines() }
            } label: {
                Text("Agree and continue").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 4)
            }
            .buttonStyle(.glassProminent)
            .accessibilityIdentifier("agreeGuidelines")
        }
    }
}

/// Report and block actions for a community recipe's menus.
struct CommunityRecipeMenuItems: View {
    let recipe: DTO.CommunityRecipe
    let report: () -> Void
    let block: () -> Void

    var body: some View {
        Button { report() } label: { Label("Report recipe", systemImage: "flag") }
        if let author = recipe.author {
            Button(role: .destructive) { block() } label: { Label("Block \(author.name)", systemImage: "person.crop.circle.badge.xmark") }
        }
    }
}

extension View {
    /// Confirms blocking a recipe's cook, then hides their recipes.
    func blockAuthorConfirmation(for recipe: Binding<DTO.CommunityRecipe?>, onBlocked: @escaping () -> Void = {}) -> some View {
        modifier(BlockAuthorConfirmation(recipe: recipe, onBlocked: onBlocked))
    }
}

private struct BlockAuthorConfirmation: ViewModifier {
    @Binding var recipe: DTO.CommunityRecipe?
    let onBlocked: () -> Void
    @Environment(CommunityModeration.self) private var moderation

    func body(content: Content) -> some View {
        let name = recipe?.author?.name ?? "this cook"
        content.confirmationDialog("Block \(name)?", isPresented: Binding(get: { recipe != nil }, set: { if !$0 { recipe = nil } }),
                                   titleVisibility: .visible, presenting: recipe) { recipe in
            Button("Block \(name)", role: .destructive) {
                if let author = recipe.author { moderation.block(author) }
                onBlocked()
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("You won't see their recipes on this device. You can unblock them in Settings.")
        }
    }
}

struct ReportRecipeSheet: View {
    let recipe: DTO.CommunityRecipe
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityModeration.self) private var moderation
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var reason: ReportReason?
    @State private var note = ""
    @State private var stage = Stage.form
    @State private var copied = false

    private enum Stage { case form, mail, copy, done }

    private var report: CommunityReport? {
        reason.map { CommunityReport(recipe: recipe, reason: $0, note: note, origin: origin) }
    }

    private var origin: String {
        if kitchen.server.isConnected { return "\(kitchen.server.address) (via companion server)" }
        return CommunityService.directURL
    }

    var body: some View {
        if stage == .mail, let report {
            MailComposer(report: report) { sent in stage = sent ? .done : .copy }
                .ignoresSafeArea()
                .interactiveDismissDisabled()
        } else {
            NavigationStack {
                Group {
                    switch stage {
                    case .form, .mail: form
                    case .copy: fallback
                    case .done: confirmation
                    }
                }
                .navigationTitle("Report recipe")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if stage == .form {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Send", role: .confirm) { send() }.disabled(reason == nil)
                        }
                    } else {
                        ToolbarItem(placement: .confirmationAction) { Button("Done", role: .close) { dismiss() } }
                    }
                }
            }
        }
    }

    private var form: some View {
        Form {
            Section {
                Text(recipe.title).font(.headline)
                if let author = recipe.author?.name { Label(author, systemImage: "person.crop.circle").foregroundStyle(.secondary) }
            }
            Section {
                Picker("Reason", selection: $reason) {
                    ForEach(ReportReason.allCases) { Text($0.rawValue).tag(Optional($0)) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                Eyebrow("What's wrong?")
            }
            Section {
                TextField("Add details (optional)", text: $note, axis: .vertical).lineLimit(3...6)
            } header: {
                Eyebrow("Note")
            } footer: {
                Text("Reports go to the Sous Chef team at \(CommunityModeration.contactEmail) and are reviewed within 24 hours. The recipe is hidden for you right away.")
            }
        }
    }

    private var confirmation: some View {
        ContentUnavailableView {
            Label("Report received", systemImage: "checkmark.shield")
        } description: {
            Text(Self.thanks)
        }
    }

    private var fallback: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Label(Self.thanks, systemImage: "checkmark.shield").foregroundStyle(Color.brand)
                Card {
                    Eyebrow("Send this report to", systemImage: "envelope")
                    Text(CommunityModeration.contactEmail).font(.headline).textSelection(.enabled)
                    Text("Mail isn't set up on this device. Copy the report and email it to us.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if let report {
                    Card {
                        Eyebrow("Report")
                        Text("\(report.subject)\n\n\(report.body)").font(.callout.monospaced()).textSelection(.enabled)
                        Button {
                            UIPasteboard.general.string = "To: \(CommunityModeration.contactEmail)\nSubject: \(report.subject)\n\n\(report.body)"
                            copied = true
                        } label: {
                            Label(copied ? "Copied" : "Copy report", systemImage: copied ? "checkmark" : "doc.on.doc")
                        }
                        .buttonStyle(.glass)
                    }
                }
            }
            .padding()
        }
    }

    private static let thanks = "Thanks. We review reports within 24 hours. This recipe is hidden for you."

    private func send() {
        guard let report else { return }
        moderation.hide(recipe)
        if MFMailComposeViewController.canSendMail() {
            stage = .mail
        } else if let url = report.mailtoURL {
            openURL(url) { accepted in stage = accepted ? .done : .copy }
        } else {
            stage = .copy
        }
    }
}

private struct MailComposer: UIViewControllerRepresentable {
    let report: CommunityReport
    let finished: (Bool) -> Void

    func makeUIViewController(context: Context) -> MFMailComposeViewController {
        let controller = MFMailComposeViewController()
        controller.mailComposeDelegate = context.coordinator
        controller.setToRecipients([CommunityModeration.contactEmail])
        controller.setSubject(report.subject)
        controller.setMessageBody(report.body, isHTML: false)
        return controller
    }

    func updateUIViewController(_ controller: MFMailComposeViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(finished: finished) }

    final class Coordinator: NSObject, MFMailComposeViewControllerDelegate {
        let finished: (Bool) -> Void
        init(finished: @escaping (Bool) -> Void) { self.finished = finished }

        func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) {
            finished(result == .sent || result == .saved)
        }
    }
}

/// Settings screen for undoing blocks and hidden recipes.
struct CommunityModerationSettingsView: View {
    @Environment(CommunityModeration.self) private var moderation

    var body: some View {
        List {
            Section {
                if moderation.blockedAuthors.isEmpty {
                    Text("You haven't blocked anyone.").foregroundStyle(.secondary)
                }
                ForEach(moderation.blockedAuthors.sorted { $0.value.localizedCaseInsensitiveCompare($1.value) == .orderedAscending }, id: \.key) { key, name in
                    HStack {
                        Label(name, systemImage: "person.crop.circle.badge.xmark")
                        Spacer()
                        Button("Unblock") { withAnimation { moderation.unblock(key: key) } }.buttonStyle(.borderless)
                    }
                }
            } header: {
                Eyebrow("Blocked cooks")
            } footer: {
                Text("Recipes from blocked cooks are hidden on this device.")
            }
            Section {
                if moderation.hiddenRecipes.isEmpty {
                    Text("No hidden recipes.").foregroundStyle(.secondary)
                }
                ForEach(moderation.hiddenRecipes.sorted { $0.value.localizedCaseInsensitiveCompare($1.value) == .orderedAscending }, id: \.key) { id, title in
                    HStack {
                        Label(title, systemImage: "eye.slash")
                        Spacer()
                        Button("Unhide") { withAnimation { moderation.unhide(id: id) } }.buttonStyle(.borderless)
                    }
                }
            } header: {
                Eyebrow("Hidden recipes")
            } footer: {
                Text("Recipes you report are hidden here. Unhiding doesn't withdraw a report.")
            }
        }
        .navigationTitle("Blocked and hidden")
        .navigationBarTitleDisplayMode(.inline)
    }
}
