import AuthenticationServices
import MessageUI
import SwiftUI

/// Community rules shown before any community content, and before publishing.
/// Agreeing and signing in are one step; browsing without an account stays
/// available because only publishing needs one.
struct CommunityGuidelinesCard: View {
    @Environment(CommunityModeration.self) private var moderation
    @Environment(CommunityAccount.self) private var account
    @State private var signInError: String?

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
            if account.isSignedIn {
                Button { accept() } label: {
                    Text("Agree and continue").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 4)
                }
                .buttonStyle(.glassProminent)
                .accessibilityIdentifier("agreeGuidelines")
            } else {
                CommunitySignInButton(error: $signInError, label: .continue) { accept() }
                if let signInError { Text(signInError).font(.footnote).foregroundStyle(.orange) }
                Button { accept() } label: {
                    Text("Browse without an account").font(.callout.weight(.semibold)).frame(maxWidth: .infinity)
                }
                .buttonStyle(.glass)
                .accessibilityIdentifier("agreeGuidelines")
                Text("By continuing, you agree to the community guidelines. You only need an account to publish recipes.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func accept() {
        withAnimation { moderation.acceptGuidelines() }
    }
}

/// Report, hide and block actions for a community recipe's menus.
struct CommunityRecipeMenuItems: View {
    let listing: Community.Listing
    let report: () -> Void
    let block: () -> Void
    @Environment(CommunityClient.self) private var client
    @Environment(CommunitySocial.self) private var social

    private var own: Bool { !listing.author.id.isEmpty && listing.author.id == social.myID }

    var body: some View {
        if !own {
            Button("Report recipe", systemImage: "flag", action: report)
            Button("Hide recipe", systemImage: "eye.slash", action: hide)
            if let name = listing.author.name.nilIfEmpty {
                Button("Block \(name)", systemImage: "person.crop.circle.badge.xmark", role: .destructive, action: block)
                    .tint(.red)
            }
        }
    }

    private func hide() {
        Task {
            // Hidden on this device at once; a server that can't be told doesn't change that.
            try? await client.setHidden(true, recipeID: listing.id, title: listing.title)
        }
    }
}

extension View {
    /// Confirms blocking a cook, then hides their recipes and tips.
    func blockCookConfirmation(for author: Binding<Community.Author?>, onBlocked: @escaping () -> Void = {}) -> some View {
        modifier(BlockCookConfirmation(author: author, onBlocked: onBlocked))
    }
}

private struct BlockCookConfirmation: ViewModifier {
    @Binding var author: Community.Author?
    let onBlocked: () -> Void
    @Environment(CommunityClient.self) private var client

    func body(content: Content) -> some View {
        content.sheet(item: $author) { blocking in
            let name = blocking.name.nilIfEmpty ?? "this cook"
            ConfirmSheet(systemImage: "hand.raised", title: "Block \(name)?",
                         message: "You won't see their recipes or tips. You can unblock them in Settings.",
                         action: "Block \(name)", actionIdentifier: "confirmBlock") {
                Task {
                    try? await client.setBlocked(true, author: blocking)
                    onBlocked()
                }
            }
        }
    }
}

extension Community.Author: Identifiable {}

/// What a report is about: a recipe, or one tip on it.
struct CommunityReportTarget: Identifiable, Hashable {
    var recipeID: String
    var title: String
    var author: Community.Author
    var tip: Community.Tip?

    var id: String { tip.map { "tip:\($0.id)" } ?? "recipe:\(recipeID)" }

    init(listing: Community.Listing, tip: Community.Tip? = nil) {
        recipeID = listing.id
        title = listing.title
        author = listing.author
        self.tip = tip
    }

    /// The report as the email fallback words it.
    func mail(reason: ReportReason, note: String, origin: String) -> CommunityReport {
        var note = note
        if let tip {
            note = ["About the tip by \(tip.author.name) (\(tip.id)): \(tip.tip ?? "")", note.nilIfEmpty].compactMap { $0 }.joined(separator: "\n")
        }
        let recipe = DTO.CommunityRecipe(id: recipeID, title: title, description: nil, tags: nil, servings: nil, totalTimeMinutes: nil, sourceUrl: nil,
                                         photoUrl: nil, photoDataUrl: nil, ingredients: [], steps: [],
                                         author: DTO.CommunityRecipe.Author(id: author.id.nilIfEmpty, name: author.name), createdAt: nil)
        return CommunityReport(recipe: recipe, reason: reason, note: note, origin: origin)
    }
}

/// Reports a recipe or a tip. The report goes to the community's moderators
/// in the app; a community that can't take it gets the report by email instead.
struct CommunityReportSheet: View {
    let target: CommunityReportTarget
    /// Called once the report is on its way.
    var onReported: () -> Void = {}
    @Environment(Kitchen.self) private var kitchen
    @Environment(CommunityModeration.self) private var moderation
    @Environment(CommunityClient.self) private var client
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var reason: ReportReason?
    @State private var note = ""
    @State private var stage = Stage.form
    @State private var copied = false
    @State private var sending = false
    @State private var error: String?

    private enum Stage { case form, mail, copy, done }

    private var isTip: Bool { target.tip != nil }

    private var report: CommunityReport? {
        reason.map { target.mail(reason: $0, note: note, origin: origin) }
    }

    private var origin: String {
        if client.mode == .companion { return "\(kitchen.server.address) (via companion server)" }
        return CommunityService.communityURL?.absoluteString ?? ""
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
                .navigationTitle(isTip ? "Report tip" : "Report recipe")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if stage == .form {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                        ToolbarItem(placement: .confirmationAction) {
                            if sending {
                                ProgressView()
                            } else {
                                Button("Send", role: .confirm) { Task { await send() } }
                                    .disabled(reason == nil)
                                    .accessibilityIdentifier("sendReport")
                            }
                        }
                    } else {
                        ToolbarItem(placement: .confirmationAction) { Button("Done", role: .close) { dismiss() } }
                    }
                }
            }
            // The default translucent sheet let the hidden recipe show through.
            .presentationBackground(Color(.systemGroupedBackground))
            .interactiveDismissDisabled(sending)
        }
    }

    private var form: some View {
        Form {
            Section {
                if let tip = target.tip {
                    Text(tip.tip ?? "").font(.headline)
                    Label(tip.author.name, systemImage: "person.crop.circle").foregroundStyle(.secondary)
                } else {
                    Text(target.title).font(.headline)
                    if let author = target.author.name.nilIfEmpty { Label(author, systemImage: "person.crop.circle").foregroundStyle(.secondary) }
                }
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
                TextField("Add details (optional)", text: $note, axis: .vertical)
                    .lineLimit(3...6)
                    .onChange(of: note) { _, value in
                        if value.count > Community.reportNoteLimit { note = String(value.prefix(Community.reportNoteLimit)) }
                    }
            } header: {
                Eyebrow("Note")
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if !note.isEmpty {
                        Text("\(note.count) of \(Community.reportNoteLimit) characters")
                            .monospacedDigit()
                            .accessibilityIdentifier("reportNoteCount")
                    }
                    Text(footer)
                }
            }
            if let error {
                Section { ErrorBanner(message: error) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
        }
    }

    private var footer: String {
        let hidden = isTip ? "The tip is hidden for you right away." : "The recipe is hidden for you right away."
        if client.capabilities.isKnown, !client.capabilities.reporting {
            return "Reports go to the Sous Chef team at \(CommunityModeration.contactEmail) and are reviewed within 24 hours. \(hidden)"
        }
        return "Reports go to the community's moderators and are reviewed within 24 hours. \(hidden)"
    }

    private var thanks: String {
        "Thanks. We review reports within 24 hours. This \(isTip ? "tip" : "recipe") is hidden for you."
    }

    private var confirmation: some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark.shield.fill")
                .font(.largeTitle.scaled(by: 1.8))
                .foregroundStyle(Color.brand)
                .symbolEffect(.bounce, options: .nonRepeating)
                .accessibilityHidden(true)
            Text("Report received").font(.title2.bold())
            Text(thanks)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button { dismiss() } label: {
                Text("Done").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 4)
            }
            .buttonStyle(.glassProminent)
            .padding(.top, 8)
            .accessibilityIdentifier("reportDone")
        }
        .padding(28)
        .frame(maxWidth: 420)
        .background(.background, in: .rect(cornerRadius: 28))
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .scrollsWhenTall()
    }

    private var fallback: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Label(thanks, systemImage: "checkmark.shield").foregroundStyle(Color.brand)
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

    private func send() async {
        guard let reason, let report else { return }
        sending = true
        error = nil
        defer { sending = false }
        do {
            let outcome = try await client.report(recipeID: target.recipeID, title: target.title, tipID: target.tip?.id,
                                                  reason: reason.contract, note: note.nilIfEmpty)
            switch outcome {
            case .sent:
                onReported()
                stage = .done
            case .useEmail:
                // This community can't take reports: hide here and send the email, as before.
                moderation.setHidden(true, recipeID: target.recipeID, title: target.title)
                onReported()
                if MFMailComposeViewController.canSendMail() {
                    stage = .mail
                } else if let url = report.mailtoURL {
                    openURL(url) { accepted in stage = accepted ? .done : .copy }
                } else {
                    stage = .copy
                }
            }
        } catch {
            self.error = error.localizedDescription
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

/// Settings screen for undoing blocks and hidden recipes. With a connected
/// server the list is the account's, shared with the web app.
struct CommunityModerationSettingsView: View {
    @Environment(CommunityClient.self) private var client
    @Environment(CommunityModeration.self) private var moderation
    @State private var list: CommunityClient.HiddenList?
    @State private var error: String?

    var body: some View {
        List {
            if let error {
                Section { ErrorBanner(message: error) }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
            if let list {
                Section {
                    if list.authors.isEmpty {
                        Text("You haven't blocked anyone.").foregroundStyle(.secondary)
                    }
                    ForEach(list.authors) { entry in
                        TrailingDetailRow {
                            Label(entry.label, systemImage: "person.crop.circle.badge.xmark")
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Button("Unblock") { Task { await unblock(entry) } }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("Unblock \(entry.label)")
                        }
                    }
                } header: {
                    Eyebrow("Blocked cooks")
                } footer: {
                    Text("Recipes and tips from blocked cooks are hidden.")
                }
                Section {
                    if list.recipes.isEmpty {
                        Text("No hidden recipes.").foregroundStyle(.secondary)
                    }
                    ForEach(list.recipes) { entry in
                        TrailingDetailRow {
                            Label(entry.label, systemImage: "eye.slash")
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Button("Unhide") { Task { await unhide(entry) } }
                                .buttonStyle(.borderless)
                                .accessibilityLabel("Unhide \(entry.label)")
                        }
                    }
                } header: {
                    Eyebrow("Hidden recipes")
                } footer: {
                    Text("Recipes you report or hide are listed here. Unhiding doesn't withdraw a report.")
                }
            } else if error == nil {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Blocked and hidden")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        do {
            list = try await client.hidden()
            error = nil
        } catch {
            // The server's list couldn't be read: show this device's.
            list = Self.local(moderation)
            self.error = error.localizedDescription
        }
    }

    static func local(_ moderation: CommunityModeration) -> CommunityClient.HiddenList {
        func entries(_ values: [String: String]) -> [CommunityClient.HiddenList.Entry] {
            values.map { .init(key: $0.key, label: $0.value) }.sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
        }
        return CommunityClient.HiddenList(recipes: entries(moderation.hiddenRecipes), authors: entries(moderation.blockedAuthors))
    }

    /// The cook an entry stands for. This device keys cooks as `id:<id>` or
    /// `name:<name>`; a server lists the cook's ID itself.
    static func author(for entry: CommunityClient.HiddenList.Entry) -> Community.Author {
        if entry.key.hasPrefix("id:") { return Community.Author(id: String(entry.key.dropFirst(3)), name: entry.label) }
        if entry.key.hasPrefix("name:") { return Community.Author(id: "", name: String(entry.key.dropFirst(5))) }
        return Community.Author(id: entry.key, name: entry.label)
    }

    private func unblock(_ entry: CommunityClient.HiddenList.Entry) async {
        do {
            try await client.setBlocked(false, author: Self.author(for: entry))
            moderation.unblock(key: entry.key)
        } catch {
            self.error = error.localizedDescription
        }
        await reload()
    }

    private func unhide(_ entry: CommunityClient.HiddenList.Entry) async {
        do {
            try await client.setHidden(false, recipeID: entry.key, title: entry.label)
        } catch {
            self.error = error.localizedDescription
        }
        await reload()
    }

    private func reload() async {
        let fresh = (try? await client.hidden()) ?? Self.local(moderation)
        withAnimation { list = fresh }
    }
}
