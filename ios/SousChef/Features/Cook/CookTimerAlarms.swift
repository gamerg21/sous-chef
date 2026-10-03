import AlarmKit
import AppIntents
import SwiftUI

/// Rings cook timers as system alarms, like the Clock app's timers: they
/// sound through silent mode and Focus and keep ringing until stopped.
/// `CookTimerAlerts` schedules one alarm per timer when the person allows
/// alarms, and falls back to a notification when they don't or AlarmKit
/// isn't available (a Mac running the iPad app).
///
/// The alarms only ring. The countdown stays in cook mode's own Live
/// Activity, which lists every timer in one place.
enum CookTimerAlarms {
    nonisolated struct Metadata: AlarmMetadata {
        var recipeTitle: String
    }

    static var isAvailable: Bool { !ProcessInfo.processInfo.isiOSAppOnMac }

    /// Asks the first time a timer starts. Returns false once alarms are
    /// turned off, so the caller can use a notification instead.
    static func authorize() async -> Bool {
        guard isAvailable else { return false }
        switch AlarmManager.shared.authorizationState {
        case .authorized: return true
        case .denied: return false
        case .notDetermined:
            return (try? await AlarmManager.shared.requestAuthorization()) == .authorized
        @unknown default: return false
        }
    }

    /// The alarm's title: "Rice is done", or "Step 3 is done".
    nonisolated static func title(for timer: CookTimer) -> String { "\(timer.label) is done" }

    /// Schedules the timer's alarm, using the timer's ID as the alarm's.
    static func schedule(_ timer: CookTimer, recipeTitle: String) async throws {
        let open = AlarmButton(text: "Open", textColor: .white, systemImageName: "frying.pan")
        let alert: AlarmPresentation.Alert
        if #available(iOS 26.1, *) {
            alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title(for: timer)),
                                            secondaryButton: open, secondaryButtonBehavior: .custom)
        } else {
            alert = AlarmPresentation.Alert(title: LocalizedStringResource(stringLiteral: title(for: timer)),
                                            stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.fill"),
                                            secondaryButton: open, secondaryButtonBehavior: .custom)
        }
        let attributes = AlarmAttributes(presentation: AlarmPresentation(alert: alert),
                                         metadata: Metadata(recipeTitle: recipeTitle),
                                         tintColor: Color.brand)
        let configuration = AlarmManager.AlarmConfiguration<Metadata>.alarm(
            schedule: .fixed(timer.ends), attributes: attributes, secondaryIntent: OpenCookModeIntent())
        _ = try await AlarmManager.shared.schedule(id: timer.id, configuration: configuration)
    }

    /// Cancels a timer's alarm, silencing it if it's ringing. Does nothing
    /// if the timer never had one.
    static func cancel(_ id: UUID) {
        guard isAvailable else { return }
        try? AlarmManager.shared.cancel(id: id)
    }
}

/// The alarm's "Open" button: stops the ringing and brings Sous Chef back to
/// cook mode, which is still open.
struct OpenCookModeIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Open Cook Mode"
    static let isDiscoverable = false
    static let supportedModes: IntentModes = .foreground(.immediate)

    func perform() async throws -> some IntentResult { .result() }
}
