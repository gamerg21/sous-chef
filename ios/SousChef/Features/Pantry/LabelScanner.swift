import SwiftUI

/// For products Open Food Facts doesn't know: photograph the package, read
/// the text on device with Vision, and let Apple Intelligence turn it into a
/// pantry item for review.
struct LabelScanSheet: View {
    var barcode: String?
    let onResult: (PantryPrefill) -> Void

    @Environment(Kitchen.self) private var kitchen
    @Environment(\.dismiss) private var dismiss
    @State private var photos: [UIImage] = []
    @State private var reading = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Take a photo of the front of the package, and another of the nutrition panel if it has one. Sous Chef reads the text on this iPhone and fills in the item for you to check.")
                        .font(.callout)
                        .foregroundStyle(.secondary)

                    PhotoStrip(photos: $photos, openCameraFirst: true)

                    if let error { ErrorBanner(message: error) }
                    if !kitchen.ai.isAvailable {
                        Text("Apple Intelligence isn't available, so Sous Chef will fill in the name and keep the label text in the item's notes.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
            }
            .navigationTitle("Scan the label")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                Button { Task { await read() } } label: {
                    Group {
                        if reading { ProgressView().tint(.white) } else { Label("Read label", systemImage: "text.viewfinder").font(.headline) }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.glassProminent)
                .disabled(photos.isEmpty || reading)
                .padding()
                .accessibilityIdentifier("readLabel")
            }
        }
        .interactiveDismissDisabled(reading)
    }

    private func read() async {
        reading = true
        error = nil
        defer { reading = false }
        let text = await TextRecognition.text(in: photos)
        guard text.contains(where: \.isLetter) else {
            error = "Sous Chef couldn't find any text. Try a closer, well-lit photo of the label."
            return
        }
        if kitchen.ai.isAvailable {
            do {
                onResult(try await kitchen.ai.readLabel(text, barcode: barcode))
                return
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
        let firstLine = text.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.first { $0.count > 2 } ?? ""
        onResult(PantryPrefill(name: firstLine.capitalized, barcode: barcode, notes: String(text.prefix(1000))))
    }
}
