import CloudKit
import UIKit

/// Registers for the pushes iCloud sync needs and hands accepted kitchen
/// invitations to `HouseholdSharing`. The SwiftUI `WindowGroup` still owns the
/// window; `SceneDelegate` only adds the CloudKit share callbacks.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // CKSyncEngine learns about changes from silent pushes.
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }

    func application(_ application: UIApplication, userDidAcceptCloudKitShareWith cloudKitShareMetadata: CKShare.Metadata) {
        HouseholdSharing.shared.handleAccepted(cloudKitShareMetadata)
    }
}

final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    /// An invitation tapped while the app wasn't running arrives with the scene.
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        if let metadata = connectionOptions.cloudKitShareMetadata {
            HouseholdSharing.shared.handleAccepted(metadata)
        }
    }

    func windowScene(_ windowScene: UIWindowScene, userDidAcceptCloudKitShareWith cloudKitShareMetadata: CKShare.Metadata) {
        HouseholdSharing.shared.handleAccepted(cloudKitShareMetadata)
    }
}
