import SwiftUI
import Vision
import VisionKit

/// Scans a product barcode with the camera (or accepts typed digits) and
/// looks it up on Open Food Facts.
struct BarcodeLookupSheet: View {
    let onFound: (PantryPrefill) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var manualCode = ""
    @State private var looking = false
    @State private var error: String?
    @State private var lastCode: String?
    @State private var scanningLabel = false

    private var scannerAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ZStack {
                    if scannerAvailable {
                        BarcodeScannerView { code in
                            guard !looking, code != lastCode else { return }
                            lastCode = code
                            Task { await lookup(code) }
                        }
                        .clipShape(.rect(cornerRadius: 28, style: .continuous))
                    } else {
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(.background.secondary)
                            .overlay {
                                ContentUnavailableView("Camera scanning unavailable", systemImage: "barcode.viewfinder",
                                                       description: Text("Type the digits under the barcode instead."))
                            }
                    }
                    if looking {
                        ProgressView("Looking up…")
                            .padding()
                            .glassEffect(.regular, in: .rect(cornerRadius: 16))
                    }
                }
                .frame(maxHeight: 360)

                if let error {
                    ErrorBanner(message: error)
                }

                HStack {
                    TextField("Barcode digits", text: $manualCode)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                    Button("Look up") { Task { await lookup(manualCode) } }
                        .buttonStyle(.glassProminent)
                        .disabled(manualCode.filter(\.isNumber).count < 8 || looking)
                }

                if let lastCode, error != nil {
                    HStack {
                        Button { scanningLabel = true } label: { Label("Scan the label", systemImage: "text.viewfinder") }
                            .buttonStyle(.glassProminent)
                        Button("Add by hand") { onFound(PantryPrefill(barcode: lastCode)) }
                            .buttonStyle(.glass)
                    }
                } else {
                    Button { scanningLabel = true } label: { Label("No barcode? Scan the label", systemImage: "text.viewfinder") }
                        .font(.subheadline)
                }
                Spacer()
                Text("Product data © Open Food Facts contributors (ODbL).")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .sheet(isPresented: $scanningLabel) {
                LabelScanSheet(barcode: error == nil ? nil : lastCode) { onFound($0) }
            }
            .navigationTitle("Scan a barcode")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
            }
        }
        .presentationDetents([.large])
    }

    private func lookup(_ code: String) async {
        error = nil
        guard OpenFoodFacts.enabled else {
            onFound(PantryPrefill(barcode: code))
            return
        }
        looking = true
        defer { looking = false }
        do {
            let result = try await OpenFoodFacts.lookup(code)
            onFound(PantryPrefill(name: result.name, barcode: code.filter(\.isNumber), category: result.category, facts: result.facts))
        } catch {
            lastCode = code.filter(\.isNumber)
            self.error = error.localizedDescription
        }
    }
}

struct BarcodeScannerView: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean8, .ean13, .upce, .code128, .itf14])],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isHighlightingEnabled: true)
        controller.delegate = context.coordinator
        try? controller.startScanning()
        return controller
    }

    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}

    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) {
        controller.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for item in addedItems {
                if case .barcode(let barcode) = item, let value = barcode.payloadStringValue {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    onCode(value)
                    return
                }
            }
        }
    }
}
