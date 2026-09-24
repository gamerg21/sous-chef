import SwiftUI

extension Color {
    /// Sous Chef emerald (#009966), from the logo.
    static let brand = Color("AccentColor")
    static let brandSoft = Color("AccentColor").opacity(0.14)
}

/// Small uppercase tracked label that sits above a group, as on the web.
struct Eyebrow: View {
    let text: String
    var systemImage: String?

    init(_ text: String, systemImage: String? = nil) {
        self.text = text
        self.systemImage = systemImage
    }

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        .textCase(.uppercase)
        .tracking(1.1)
        .foregroundStyle(.secondary)
    }
}

/// Rounded card for grouped content.
struct Card<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background.secondary, in: .rect(cornerRadius: 22, style: .continuous))
    }
}

struct Chip: View {
    let text: String
    var systemImage: String?
    var tint: Color = .brand
    var selected = false

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage).imageScale(.small) }
            Text(text).lineLimit(1)
        }
        .font(.caption.weight(.medium))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .foregroundStyle(selected ? Color.white : tint)
        .background(selected ? tint : tint.opacity(0.12), in: .capsule)
    }
}

/// Round icon badge used in rows and headers.
struct IconBadge: View {
    let systemImage: String
    var tint: Color = .brand
    var size: CGFloat = 34

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: size * 0.44, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(tint.opacity(0.14), in: .circle)
    }
}

struct StatusDot: View {
    var color: Color
    var body: some View {
        Circle().fill(color).frame(width: 8, height: 8)
    }
}

/// Settings lives behind a toolbar button on every tab.
struct SettingsToolbarButton: ToolbarContent {
    @Binding var showSettings: Bool
    @Environment(Kitchen.self) private var kitchen

    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                showSettings = true
            } label: {
                Label("Settings", systemImage: syncSymbol)
            }
            .accessibilityIdentifier("settingsButton")
        }
    }

    private var syncSymbol: String {
        switch kitchen.server.status {
        case .syncing: "arrow.triangle.2.circlepath"
        case .failed: "exclamationmark.icloud"
        default: "gearshape"
        }
    }
}

struct RecipeImage: View {
    let data: Data?
    var symbol = "fork.knife"
    /// Longest side of the decoded image, in pixels. Cards need far less
    /// than the stored photo, which is up to 1600 px.
    var maxPixel = 600
    @State private var loaded: UIImage?

    var body: some View {
        let image = loaded ?? data.flatMap { PhotoThumbnails.cached($0, maxPixel: maxPixel) }
        ZStack {
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                LinearGradient(colors: [Color.brand.opacity(0.28), Color.brand.opacity(0.08)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if data == nil {
                    Image(systemName: symbol)
                        .font(.system(size: 28, weight: .light))
                        .foregroundStyle(Color.brand.opacity(0.7))
                        .accessibilityHidden(true)
                }
            }
        }
        .task(id: data) {
            loaded = nil
            guard let data else { return }
            loaded = await PhotoThumbnails.load(data, maxPixel: maxPixel)
        }
    }
}

/// Days until expiry, with a color that reads at a glance.
struct ExpiryLabel: View {
    let date: Date?

    var body: some View {
        if let date, let info = Self.describe(date) {
            Label(info.text, systemImage: "clock")
                .font(.caption)
                .foregroundStyle(info.color)
                .labelStyle(.titleAndIcon)
        }
    }

    static func days(until date: Date) -> Int {
        Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: .now), to: Calendar.current.startOfDay(for: date)).day ?? 0
    }

    static func describe(_ date: Date) -> (text: String, color: Color)? {
        let days = days(until: date)
        switch days {
        case ..<0: return ("Expired \(-days)d ago", .red)
        case 0: return ("Expires today", .red)
        case 1: return ("Expires tomorrow", .orange)
        case 2...5: return ("\(days) days left", .orange)
        default: return (date.formatted(.dateTime.month(.abbreviated).day()), .secondary)
        }
    }
}

struct ErrorBanner: View {
    let message: String
    var body: some View {
        Label(message, systemImage: "exclamationmark.triangle.fill")
            .font(.callout)
            .foregroundStyle(.orange)
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.orange.opacity(0.12), in: .rect(cornerRadius: 14, style: .continuous))
    }
}

struct NumberField: View {
    let title: String
    @Binding var value: Double?
    var format: FloatingPointFormatStyle<Double> = .number.precision(.fractionLength(0...2))

    var body: some View {
        TextField(title, value: $value, format: format)
            .keyboardType(.decimalPad)
    }
}

extension View {
    /// The recurring hero title style from the web's grouped-card design.
    func heroTitle() -> some View {
        font(.system(.largeTitle, design: .rounded, weight: .bold))
    }
}
