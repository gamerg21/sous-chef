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
        let host = UIHostingController(rootView: ShareView(items: items) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        })
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }
}

struct ShareView: View {
    let items: [NSExtensionItem]
    let done: () -> Void

    private enum Phase {
        case reading
        case added(title: String, detail: String)
        case failed(String)
    }

    @State private var phase = Phase.reading

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                switch phase {
                case .reading:
                    ProgressView()
                case .added(let title, let detail):
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 52))
                        .foregroundStyle(.tint)
                        .symbolEffect(.bounce, value: title)
                    Text(title)
                        .font(.headline)
                        .multilineTextAlignment(.center)
                        .lineLimit(3)
                    Text(detail)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
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
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: done)
                }
            }
        }
        .tint(Color("AccentColor"))
        .task { await receive() }
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
        let pageTitle = items.lazy.compactMap { $0.attributedContentText?.string.trimmingCharacters(in: .whitespacesAndNewlines) }.first { !$0.isEmpty }
        switch item {
        case .link(let link):
            let site = (link.host() ?? "").replacingOccurrences(of: "www.", with: "")
            phase = .added(title: pageTitle ?? "Recipe from \(site)", detail: "Open Sous Chef to review and save it.")
        case .text:
            phase = .added(title: "Recipe text added", detail: "Open Sous Chef to review and save it.")
        }
        try? await Task.sleep(for: .seconds(1.6))
        done()
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
