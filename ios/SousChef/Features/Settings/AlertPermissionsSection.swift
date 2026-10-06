import SwiftUI

/// Shows whether notifications, alarms and Live Activities are allowed, asks
/// for whatever hasn't been asked yet, and links to the Settings app for
/// anything that was turned off. Rechecks whenever Sous Chef comes back to
/// the foreground, such as after a trip to the Settings app.
struct AlertPermissionsSection: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var status: AlertPermissions.Status?
    @State private var asking = false

    var body: some View {
        Section {
            if let status {
                row("Notifications", systemImage: "bell.badge", state: status.notifications,
                    note: status.notificationSoundOff ? "Sounds are off" : nil)
                if status.alarms != .unavailable {
                    row("Timer alarms", systemImage: "alarm", state: status.alarms)
                }
                if status.liveActivities != .unavailable {
                    row("Live Activities", systemImage: "timer", state: status.liveActivities)
                }
                if status.canAsk {
                    Button {
                        asking = true
                        Task {
                            await AlertPermissions.requestAll()
                            await refresh()
                            asking = false
                        }
                    } label: {
                        Label(Self.askTitle(for: status), systemImage: "bell")
                    }
                    .disabled(asking)
                    .accessibilityIdentifier("requestAlertPermissions")
                }
                if status.needsSettings, let url = AlertPermissions.settingsURL {
                    Link(destination: url) {
                        Label("Change in Settings", systemImage: "gear")
                    }
                    .accessibilityIdentifier("openAlertSettings")
                }
            }
        } header: {
            Eyebrow("Permissions")
        } footer: {
            Text(footer)
        }
        .task { await refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await refresh() } }
        }
    }

    private var footer: String {
        guard let status else { return "" }
        if !status.timersCanAlert {
            return "With notifications and alarms off, cook timers only show in Sous Chef and can't alert you when it's closed or the phone is locked."
        }
        return "Cook timers notify you with a sound when they finish. Timer alarms ring even in silent mode, and Live Activities show the countdown on the Lock Screen and in the Dynamic Island."
    }

    private func row(_ title: String, systemImage: String, state: AlertPermissions.State, note: String? = nil) -> some View {
        LabeledContent {
            VStack(alignment: .trailing, spacing: 2) {
                Text(Self.label(for: state))
                    .foregroundStyle(state == .allowed ? Color.brand : state == .off ? .orange : .secondary)
                if let note {
                    Text(note).font(.caption).foregroundStyle(.orange)
                }
            }
        } label: {
            Label(title, systemImage: systemImage)
        }
        .accessibilityElement(children: .combine)
    }

    /// Names only what can still be asked for here.
    static func askTitle(for status: AlertPermissions.Status) -> String {
        switch (status.notifications == .notAsked, status.alarms == .notAsked) {
        case (true, true): "Turn on notifications and alarms"
        case (false, true): "Turn on timer alarms"
        default: "Turn on notifications"
        }
    }

    static func label(for state: AlertPermissions.State) -> String {
        switch state {
        case .allowed: "On"
        case .off: "Off"
        case .notAsked: "Not set up"
        case .unavailable: "Not available"
        }
    }

    private func refresh() async {
        status = await AlertPermissions.current()
    }
}
