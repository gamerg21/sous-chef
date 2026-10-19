import CloudKit
import Foundation
import Observation

/// Syncs the kitchen through iCloud with `CKSyncEngine`, replacing SwiftData's
/// built-in mirroring so a kitchen can be shared with other Apple IDs.
///
/// The local SwiftData store stays the working copy. One CloudKit zone holds
/// one kitchen:
/// - **Personal:** the "Kitchen" zone in this person's private database.
/// - **Household member:** the owner's "Kitchen" zone, reached through this
///   person's shared database after accepting a `CKShare`.
///
/// Only one zone is active at a time; its records are what the local store shows.
///
/// INTERFACE STUB: `HouseholdSharing` and the settings UI code against this
/// surface. The engine implementation fills in the bodies.
@Observable
final class CloudSync {
    enum Status: Equatable {
        case off, idle, syncing, synced(Date), failed(String)
    }

    /// Which kitchen this device syncs.
    enum Scope: Equatable, Codable {
        /// This person's own kitchen, in their private database.
        case personal
        /// Someone else's kitchen shared with this person, in their shared database.
        case household(zoneName: String, ownerName: String)
    }

    static let zoneName = "Kitchen"
    static let personalZoneID = CKRecordZone.ID(zoneName: zoneName, ownerName: CKCurrentUserDefaultName)

    private(set) var status: Status = .off
    private(set) var scope: Scope = .personal
    /// Set when the owner stopped sharing or removed this person, and the
    /// device went back to its personal kitchen. The UI shows it once and clears it.
    var householdEndedNotice: String?

    var isHouseholdMember: Bool { scope != .personal }

    /// The zone holding the active kitchen.
    var activeZoneID: CKRecordZone.ID {
        switch scope {
        case .personal: Self.personalZoneID
        case .household(let zoneName, let ownerName): CKRecordZone.ID(zoneName: zoneName, ownerName: ownerName)
        }
    }

    weak var kitchen: Kitchen?

    init() {}

    /// Starts syncing the active zone. Called when iCloud is on.
    func start() {}

    /// Stops syncing; local data stays.
    func stop() {}

    /// Call after local saves: finds what changed and queues it for upload.
    func localChangesSaved() {}

    /// Sends and fetches now.
    func syncNow() async {}

    /// Switches this device to a kitchen shared with this person (after the
    /// share was accepted). `mergeLocal` uploads this device's kitchen into
    /// the shared one; otherwise the local store is replaced by the shared kitchen.
    /// The personal zone in iCloud is left untouched either way.
    func joinHousehold(zoneID: CKRecordZone.ID, mergeLocal: Bool) async throws {}

    /// Goes back to this person's personal kitchen: clears the local store
    /// (without deleting anything in the shared zone) and refetches the personal zone.
    func leaveHousehold() async throws {}

    /// Deletes the personal zone (and the old SwiftData mirroring zone) from
    /// iCloud and stops syncing. The local copy stays.
    func deleteCloudData() async throws {}
}
