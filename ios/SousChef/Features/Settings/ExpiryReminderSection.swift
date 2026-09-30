import SwiftUI
import UIKit

/// Settings for "expiring soon": the window in days and the opt-in daily reminder.
struct ExpiryReminderSection: View {
    @AppStorage(ExpiringFood.windowDaysKey, store: ExpiringFood.settings) private var windowDays = ExpiringFood.defaultWindowDays
    private var reminders = ExpiryReminders.shared
    @State private var enabled = ExpiryReminders.shared.isEnabled
    @State private var time = ExpiryReminderSection.date(from: ExpiryReminders.shared.time)
    @State private var updating = false

    var body: some View {
        Section {
            Picker(selection: $windowDays) {
                ForEach(ExpiringFood.windowChoices, id: \.self) { days in
                    Text(days == 1 ? "1 day" : "\(days) days").tag(days)
                }
            } label: {
                Label("Expiring soon means within", systemImage: "hourglass")
            }
            .onChange(of: windowDays) { reminders.reschedule() }

            Toggle(isOn: $enabled) {
                Label("Daily reminder", systemImage: "bell.badge")
            }
            .disabled(updating)
            .onChange(of: enabled) { _, wanted in
                guard wanted != reminders.isEnabled else { return }
                updating = true
                Task {
                    // Permission is asked for only now, when the cook opts in.
                    await reminders.setEnabled(wanted)
                    enabled = reminders.isEnabled
                    updating = false
                }
            }

            if reminders.isEnabled {
                DatePicker("Remind me at", selection: $time, displayedComponents: .hourAndMinute)
                    .onChange(of: time) { _, date in
                        reminders.time = Calendar.current.dateComponents([.hour, .minute], from: date)
                    }
            }
            if reminders.isDenied, let settings = URL(string: UIApplication.openNotificationSettingsURLString) {
                Link(destination: settings) {
                    Label("Allow notifications in Settings", systemImage: "gear")
                }
            }
        } header: {
            Eyebrow("Expiry reminders")
        } footer: {
            Text("At the time you choose, Sous Chef lists what expires soon, such as “Milk and spinach expire in 2 days”. Days with nothing expiring stay quiet. Reminders are worked out on this device from your pantry; tap one to see recipes that use that food.")
        }
        .task { await reminders.refreshAuthorization() }
    }

    private static func date(from time: DateComponents) -> Date {
        Calendar.current.date(bySettingHour: time.hour ?? 9, minute: time.minute ?? 0, second: 0, of: .now) ?? .now
    }
}
