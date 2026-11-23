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
            TrailingDetailRow(minimumLeadingWidth: 100) {
                Label("Expires", systemImage: "calendar.badge.clock")
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack {
                    Text(date.map { $0.formatted(date: .abbreviated, time: .omitted) } ?? "No expiration")
                        .foregroundStyle(date == nil ? .secondary : Color.brand)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(open ? 180 : 0))
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityValue(date.map { $0.formatted(date: .long, time: .omitted) } ?? "No expiration")
        .accessibilityIdentifier("expiryField")

        if open {
            ScrollView(.horizontal) {
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
            .scrollIndicators(.hidden)
            .scrollClipDisabled()

            DatePicker("Use by", selection: Binding(get: { date ?? Self.day(in: 0) }, set: { pickFromCalendar($0) }), displayedComponents: .date)
                .datePickerStyle(.graphical)
                .labelsHidden()
                .tint(.brand)
        }
    }

    private func pick(_ value: Date?) {
        date = value.map { Calendar.current.startOfDay(for: $0) }
        withAnimation(.snappy) { open = false }
    }

    /// The calendar's month/year wheel moves the selection as it scrolls, so
    /// only close the drawer when a day was tapped.
    private func pickFromCalendar(_ value: Date) {
        let previous = date ?? Self.day(in: 0)
        guard Self.isDayTap(from: previous, to: value) else {
            date = Calendar.current.startOfDay(for: value)
            return
        }
        pick(value)
    }

    /// The month/year wheel keeps the day of the month (clamped to the last
    /// day when the new month is shorter); a changed day means a tap.
    static func isDayTap(from old: Date, to new: Date, calendar: Calendar = .current) -> Bool {
        let oldDay = calendar.component(.day, from: old)
        let newDay = calendar.component(.day, from: new)
        if oldDay == newDay {
            return calendar.isDate(old, equalTo: new, toGranularity: .month)
        }
        let lastDay = calendar.range(of: .day, in: .month, for: new)?.count ?? 31
        return !(oldDay > lastDay && newDay == lastDay)
    }

    static func day(in days: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: days, to: Calendar.current.startOfDay(for: .now)) ?? .now
    }
}
