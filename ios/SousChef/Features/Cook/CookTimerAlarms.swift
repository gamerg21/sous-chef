import AlarmKit
import AppIntents
import SwiftUI

/// Rings cook timers as system alarms, like the Clock app's timers: they
/// sound through silent mode and Focus and keep ringing until stopped.
/// `CookTimerAlerts` schedules one alarm per timer when the person allows
/// alarms, alongside the notification every timer gets.
///
/// The alarms only ring. The countdown stays in cook mode's own Live
/// Activity, which lists every timer in one place.
enum CookTimerAlarms {
    typealias Metadata = CookTimerAlarmMetadata

    static var isAvailable: Bool { !ProcessInfo.processInfo.isiOSAppOnMac }

    /// Onboarding normally asks first; otherwise asks the first time a timer
    /// starts. Returns false once alarms are turned off.
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
            schedule: .fixed(timer.ends), attributes: attributes,
            stopIntent: StopCookTimerAlarmIntent(timerID: timer.id), secondaryIntent: OpenCookModeIntent())
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

    func perform() async throws -> some IntentResult {
        await CookTimerAlerts.shared.refreshActivity()
        return .result()
    }
}

/// The alarm's "Stop" button: silences it and, without opening Sous Chef,
/// updates the cook timer Live Activity so the finished timer says "Done".
struct StopCookTimerAlarmIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Stop Cook Timer"
    static let isDiscoverable = false

    @Parameter(title: "Timer")
    var timerID: String

    init() {}

    init(timerID: UUID) {
        self.timerID = timerID.uuidString
    }

    func perform() async throws -> some IntentResult {
        if let id = UUID(uuidString: timerID) {
            try? AlarmManager.shared.stop(id: id)
        }
        await CookTimerAlerts.shared.refreshActivity()
        return .result()
    }
}
