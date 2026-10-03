import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Sous Chef in the share sheet. It hands a recipe link, or recipe text, to
/// the app through `SharedRecipeInbox`; the app imports it the next time it
/// opens, so this extension needs neither the kitchen store nor the network.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let host = UIHostingController(rootView: ShareView(items: items, openApp: { [weak self] in
            self?.openSousChef() ?? false
        }, done: { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    /// Share extensions have no API for opening their app. Asking the
    /// application found up the responder chain is the long-standing
    /// workaround; false means there was none to ask.
    private func openSousChef() -> Bool {
        guard let url = URL(string: "souschef://shared") else { return false }
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return true
            }
            responder = current.next
        }
        return false
    }
}

struct ShareView: View {
    let items: [NSExtensionItem]
    let openApp: () -> Bool
    let done: () -> Void

    private enum Phase {
        case reading
        case added(title: String)
        case failed(String)
    }

    @State private var phase = Phase.reading
    @State private var couldNotOpen = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                switch phase {
                case .reading:
                    ProgressView()
                case .added(let title):
                    added(title)
                case .failed(let message):
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.orange)
                    Text(message)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Sous Chef")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if case .failed = phase {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", action: done)
                    }
                }
            }
        }
        .tint(Color("AccentColor"))
        .task { await receive() }
    }

    /// Stays up until the cook chooses, because the recipe isn't saved until
    /// it's reviewed in the app.
    @ViewBuilder
    private func added(_ title: String) -> some View {
        Image(systemName: "tray.and.arrow.down.fill")
            .font(.system(size: 48))
            .foregroundStyle(.tint)
            .symbolEffect(.bounce, value: title)
        Text(title)
            .font(.headline)
            .multilineTextAlignment(.center)
            .lineLimit(3)
        VStack(spacing: 4) {
            Text("One more step")
                .font(.subheadline.weight(.semibold))
            Text(couldNotOpen
                 ? "Open Sous Chef from your Home Screen to review this recipe and save it."
                 : "This recipe isn't in your recipes yet. Open Sous Chef to review it and save it.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 6)
        VStack(spacing: 10) {
            if !couldNotOpen {
                Button {
                    if openApp() { done() } else { couldNotOpen = true }
                } label: {
                    Text("Open Sous Chef")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
            }
            Button(couldNotOpen ? "Done" : "Later", action: done)
                .padding(.vertical, 6)
        }
        .padding(.top, 12)
    }

    private func receive() async {
        let (url, text) = await Self.content(of: items)
        guard let item = SharedRecipeInbox.item(url: url, text: text) else {
            phase = .failed("There's no recipe link or text here to import.")
            return
        }
        guard SharedRecipeInbox.add(item) else {
            phase = .failed("Sous Chef couldn't receive this. Open Sous Chef and import it from Recipes instead.")
            return
        }
        // "Easy pancakes recipe | Good Food" reads as "Easy pancakes recipe".
        let pageTitle = items.lazy
            .compactMap { $0.attributedContentText?.string.components(separatedBy: " | ").first?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        switch item {
        case .link(let link):
            let site = (link.host() ?? "").replacingOccurrences(of: "www.", with: "")
            phase = .added(title: pageTitle ?? "Recipe from \(site)")
        case .text:
            phase = .added(title: "Shared recipe text")
        }
    }

    /// The first web link and the first text among the shared items.
    private static func content(of items: [NSExtensionItem]) async -> (URL?, String?) {
        let providers = items.flatMap { $0.attachments ?? [] }
        var url: URL?
        var text: String?
        for provider in providers {
            if url == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
               let value = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) {
                url = (value as? URL) ?? (value as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
                if url?.isFileURL == true { url = nil }
            }
            if text == nil, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
               let value = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) {
                text = (value as? String) ?? (value as? Data).map { String(decoding: $0, as: UTF8.self) }
            }
        }
        return (url, text)
    }
}
