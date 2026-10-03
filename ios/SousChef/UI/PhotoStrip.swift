import PhotosUI
import SwiftUI
import Vision

/// A row of photos with camera and library tiles, for scanning labels and
/// recipe pages. Screenshots come in through the library.
struct PhotoStrip: View {
    @Binding var photos: [UIImage]
    var maxCount = 4
    /// Opens the camera straight away when the strip first appears empty.
    var openCameraFirst = false

    @State private var libraryItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var appeared = false

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 12) {
                // Photos are identified by the image itself, not its position,
                // so removing one never removes or animates its neighbour.
                ForEach(photos.enumerated(), id: \.element) { index, photo in
                    Image(uiImage: photo)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 120, height: 160)
                        .clipShape(.rect(cornerRadius: 18, style: .continuous))
                        .overlay(alignment: .topTrailing) {
                            Button { photos.removeAll { $0 === photo } } label: {
                                Image(systemName: "xmark.circle.fill").font(.title3).symbolRenderingMode(.palette)
                                    .foregroundStyle(.white, .black.opacity(0.5))
                            }
                            .padding(6)
                            .accessibilityLabel("Remove photo \(index + 1)")
                        }
                }
                if photos.count < maxCount { addTile }
            }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .fullScreenCover(isPresented: $showCamera) {
            CameraCapture { image in photos.append(image) }
                .ignoresSafeArea()
        }
        .onChange(of: libraryItems) {
            let items = libraryItems
            guard !items.isEmpty else { return }
            libraryItems = []
            Task {
                for item in items {
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data), photos.count < maxCount {
                        photos.append(image)
                    }
                }
            }
        }
        .onAppear {
            guard !appeared else { return }
            appeared = true
            if openCameraFirst && photos.isEmpty && cameraAvailable { showCamera = true }
        }
    }

    private var addTile: some View {
        VStack(spacing: 10) {
            if cameraAvailable {
                Button { showCamera = true } label: { Label("Camera", systemImage: "camera").lineLimit(1) }
                    .buttonStyle(.glass)
            }
            PhotosPicker(selection: $libraryItems, maxSelectionCount: maxCount - photos.count, matching: .images) {
                Label("Photos", systemImage: "photo.on.rectangle").lineLimit(1)
            }
            .buttonStyle(.glass)
        }
        .frame(width: 160, height: 160)
        .background(.background.secondary, in: .rect(cornerRadius: 18, style: .continuous))
    }
}

enum TextRecognition {
    /// Reads printed text on device with Vision, top to bottom.
    nonisolated static func text(in image: UIImage) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.9) else { return "" }
        var request = RecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let observations = try await request.perform(on: data)
        return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }

    /// All pages in order, separated by blank lines.
    nonisolated static func text(in images: [UIImage]) async -> String {
        var pages: [String] = []
        for image in images {
            if let page = try? await text(in: image), !page.isEmpty { pages.append(page) }
        }
        return pages.joined(separator: "\n\n")
    }
}

/// The system camera, returning one photo per capture.
struct CameraCapture: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraCapture
        init(parent: CameraCapture) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
