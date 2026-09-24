import SwiftUI

/// Expiry row that opens an inline drawer with quick durations and a
/// calendar, like the web app's expiry picker. Use inside a `Form` section.
struct ExpiryField: View {
    @Binding var date: Date?
    @State private var open = false

    /// Same shortcuts as the web app's `EXPIRY_SHORTCUTS`.
    static let shortcuts: [(label: String, days: Int)] = [
        ("3 days", 3), ("1 week", 7), ("2 weeks", 14), ("1 month", 30), ("6 months", 182),
    ]

    var body: some View {
        Button {
            // The calendar needs the room the keyboard would take.
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            withAnimation(.snappy) { open.toggle() }
        } label: {
            HStack {
                Label("Expires", systemImage: "calendar.badge.clock")
                    .foregroundStyle(.primary)
                Spacer()
                Text(date.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? "No expiration")
                    .foregroundStyle(date == nil ? .secondary : Color.brand)
                Image(systemName: "chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .rotationEffect(.degrees(open ? 180 : 0))
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityValue(date.map { $0.formatted(date: .long, time: .omitted) } ?? "No expiration")
        .accessibilityIdentifier("expiryField")

        if open {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Self.shortcuts, id: \.days) { shortcut in
                        Button { pick(Self.day(in: shortcut.days)) } label: {
                            Chip(text: shortcut.label, selected: date.map { Calendar.current.isDate($0, inSameDayAs: Self.day(in: shortcut.days)) } ?? false)
                                .font(.subheadline)
                        }
                        .buttonStyle(.plain)
                    }
                    if date != nil {
                        Button { pick(nil) } label: { Chip(text: "No expiration", systemImage: "xmark", tint: .secondary) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 2)
            }
            .scrollClipDisabled()

            DatePicker("Use by", selection: Binding(get: { date ?? Self.day(in: 0) }, set: { pick($0) }), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .labelsHidden()
                .tint(.brand)
        }
    }

    private func pick(_ value: Date?) {
        date = value.map { Calendar.current.startOfDay(for: $0) }
        withAnimation(.snappy) { open = false }
    }

    static func day(in days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: Calendar.current.startOfDay(for: .now)) ?? .now
    }
}
