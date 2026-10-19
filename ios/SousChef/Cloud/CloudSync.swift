import CloudKit
import Foundation
import Observation
import SwiftData
import UIKit

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
/// How it works:
/// - Each synced model is one record (type = model name, name = `uuid`).
///   `CloudRecordMapping` maps fields; `CloudRecordMeta` keeps each record's
///   system fields and merge base on the device.
/// - Local edits are found in SwiftData's history (`localChangesSaved()`),
///   skipping changes CloudSync itself saved under `CloudSync.author`.
/// - Conflicts merge field by field (`CloudMerge`).
/// - The engine's state is saved per scope in Application Support, and the
///   scope is shared with the person's other devices through iCloud
///   key-value storage, so they follow a join or leave.
@Observable @MainActor
final class CloudSync: CKSyncEngineDelegate {
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
    /// The zone SwiftData's old CloudKit mirroring used. Left alone so devices
    /// still on an older version keep syncing; deleted with the personal zone.
    static let legacyMirroringZoneID = CKRecordZone.ID(zoneName: "com.apple.coredata.cloudkit.zone", ownerName: CKCurrentUserDefaultName)
    /// `ModelContext.author` for changes CloudSync saves, so they aren't sent back.
    static let author = "CloudSync"

    private(set) var status: Status = .off
    private(set) var scope: Scope = .personal
    /// Set when the owner stopped sharing or removed this person, and the
    /// device went back to its personal kitchen. The UI shows it once and clears it.
    var householdEndedNotice: String?
    /// Whether this device is syncing with iCloud (an engine is running).
    private(set) var isRunning = false

    var isHouseholdMember: Bool { scope != .personal }

    /// The zone holding the active kitchen.
    var activeZoneID: CKRecordZone.ID {
        switch scope {
        case .personal: Self.personalZoneID
        case .household(let zoneName, let ownerName): CKRecordZone.ID(zoneName: zoneName, ownerName: ownerName)
        }
    }

    weak var kitchen: Kitchen?

    @ObservationIgnored var engine: CKSyncEngine?
    @ObservationIgnored var historyToken: DefaultHistoryToken?
    /// True while CloudSync writes to the store, so its own saves aren't read as local edits.
    @ObservationIgnored var applying = false
    /// Records being sent: the fields sent (digested, the next base) and temporary asset files.
    @ObservationIgnored var inFlight: [CKRecord.ID: (fields: CloudFields, files: [URL])] = [:]
    /// Saves that failed for a reason that needs time (iCloud full); retried on activation.
    @ObservationIgnored var deferred: Set<CKRecord.ID> = []
    @ObservationIgnored private var observers: [NSObjectProtocol] = []
    @ObservationIgnored private var switching = false
    @ObservationIgnored private lazy var container = CKContainer(identifier: Kitchen.cloudContainerID)

    init() {
        scope = Self.decodeScope(UserDefaults.standard.data(forKey: Self.scopeKey)) ?? .personal
        historyToken = Self.loadHistoryToken()
    }

    // MARK: Public surface

    /// Starts syncing the active zone. Called when iCloud is on.
    func start() {
        guard engine == nil, !switching, let kitchen, kitchen.iCloudAvailable else { return }
        observe()
        isRunning = true
        status = .idle
        Self.removeLeftoverAssets()
        startEngine()
        followOtherDevices()
    }

    /// Stops syncing; local data stays.
    func stop() {
        stopEngine()
        isRunning = false
        status = .off
    }

    /// Sends and fetches now.
    func syncNow() async {
        guard let engine else { return }
        localChangesSaved()
        do {
            try await engine.fetchChanges(fetchOptions)
            try await engine.sendChanges()
        } catch {
            if engine === self.engine { status = .failed(Self.message(for: error)) }
        }
    }

    /// Switches this device to a kitchen shared with this person (after the
    /// share was accepted). `mergeLocal` uploads this device's kitchen into
    /// the shared one; otherwise the local store is replaced by the shared kitchen.
    /// The personal zone in iCloud is left untouched either way.
    func joinHousehold(zoneID: CKRecordZone.ID, mergeLocal: Bool) async throws {
        guard let kitchen, kitchen.iCloudAvailable else { throw CloudSyncError.unavailable }
        let target = Scope.household(zoneName: zoneID.zoneName, ownerName: zoneID.ownerName)
        if scope == target, engine != nil { return }
        guard !switching else { throw CloudSyncError.busy }
        switching = true
        defer { switching = false }
        // Make sure the shared kitchen is reachable before touching local data.
        _ = try await container.sharedCloudDatabase.recordZone(for: zoneID)
        // Whatever this device hasn't sent yet belongs to the kitchen it's leaving.
        await flush()
        // Starting fresh clears this device, so its kitchen must be safely in
        // the personal zone first; otherwise it could be lost.
        if !mergeLocal, let engine, !engine.state.pendingRecordZoneChanges.isEmpty { throw CloudSyncError.unsaved }
        stopEngine()
        Self.removeState(for: target)
        deleteMetas(in: zoneID)
        if !mergeLocal { removeLocalKitchen() }
        scope = target
        publishScope()
        Kitchen.iCloudPreferred = true
        observe()
        isRunning = true
        startEngine()
        afterRemoteChanges()
        Task { await syncNow() }
    }

    /// Goes back to this person's personal kitchen: clears the local store
    /// (without deleting anything in the shared zone) and refetches the personal zone.
    func leaveHousehold() async throws {
        guard case .household = scope else { return }
        guard !switching else { throw CloudSyncError.busy }
        switching = true
        defer { switching = false }
        let household = activeZoneID
        await flush()
        stopEngine()
        Self.removeState(for: scope)
        deleteMetas(in: household)
        removeLocalKitchen()
        scope = .personal
        publishScope()
        // Fetch the personal kitchen from the start, since the local copy is gone.
        Self.removeState(for: .personal)
        deleteMetas(in: Self.personalZoneID)
        afterRemoteChanges()
        if let kitchen, kitchen.iCloudAvailable, Kitchen.iCloudPreferred {
            isRunning = true
            status = .idle
            startEngine()
            Task { await syncNow() }
        } else {
            isRunning = false
            status = .off
        }
    }

    /// Deletes the personal zone (and the old SwiftData mirroring zone) from
    /// iCloud and stops syncing. The local copy stays.
    func deleteCloudData() async throws {
        stop()
        guard let kitchen, kitchen.iCloudAvailable else { return }
        let results = try await container.privateCloudDatabase.modifyRecordZones(saving: [], deleting: [Self.personalZoneID, Self.legacyMirroringZoneID])
        for result in results.deleteResults.values {
            if case .failure(let error) = result, (error as? CKError)?.code != .zoneNotFound { throw error }
        }
        Self.removeState(for: .personal)
        deleteMetas(in: Self.personalZoneID)
    }

    enum CloudSyncError: LocalizedError {
        case unavailable, busy, unsaved

        var errorDescription: String? {
            switch self {
            case .unavailable: "iCloud isn't available in this build."
            case .busy: "Sous Chef is already switching kitchens."
            case .unsaved: "Your kitchen couldn't be saved to iCloud first, so nothing was changed. Check your connection and try again."
            }
        }
    }

    // MARK: Engine lifecycle

    var fetchOptions: CKSyncEngine.FetchChangesOptions {
        CKSyncEngine.FetchChangesOptions(scope: .zoneIDs([activeZoneID]))
    }

    private func startEngine() {
        guard let kitchen else { return }
        let database = scope == .personal ? container.privateCloudDatabase : container.sharedCloudDatabase
        let saved = Self.loadState(for: scope)
        let engine = CKSyncEngine(CKSyncEngine.Configuration(database: database, stateSerialization: saved, delegate: self))
        self.engine = engine
        if saved == nil {
            // A first sync of this zone (an upgrade from SwiftData's mirroring,
            // a join that keeps local data, or a zone deleted and restarted):
            // send everything here. Records already in the zone conflict and merge.
            if scope == .personal { engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.personalZoneID))]) }
            if kitchen.context.hasChanges { try? kitchen.context.save() }
            queueAllLocalRecords()
            historyToken = latestHistoryToken()
            saveHistoryToken()
        } else {
            localChangesSaved()
        }
        pruneHistory()
    }

    func stopEngine() {
        guard let engine else { return }
        self.engine = nil
        for (_, sent) in inFlight { sent.files.forEach(Self.removeFile) }
        inFlight = [:]
        Task { await engine.cancelOperations() }
    }

    /// Sends what's waiting before the device switches kitchens.
    private func flush() async {
        guard let engine else { return }
        localChangesSaved()
        try? await engine.sendChanges()
    }

    func queueAllLocalRecords() {
        guard let engine else { return }
        let zone = activeZoneID
        var changes: [CKSyncEngine.PendingRecordZoneChange] = []
        for type in CloudRecordType.allCases {
            for uuid in localModels(of: type).keys { changes.append(.saveRecord(Self.recordID(uuid, in: zone))) }
        }
        engine.state.add(pendingRecordZoneChanges: changes)
    }

    // MARK: Kitchen-level events

    /// The personal zone was deleted elsewhere ("Remove kitchen from iCloud"
    /// on another device): this device stops syncing and keeps its copy.
    func personalZoneRemoved() {
        stop()
        Kitchen.iCloudPreferred = false
        Self.removeState(for: .personal)
        deleteMetas(in: Self.personalZoneID)
    }

    /// The shared kitchen is gone (the owner stopped sharing or removed this person).
    func householdEnded() {
        guard case .household = scope, !switching else { return }
        householdEndedNotice = "The owner stopped sharing their kitchen, so this device is back on your own kitchen."
        Task { try? await leaveHousehold() }
    }

    /// Signed in to a different Apple ID: the old account's kitchen leaves the
    /// device and syncing starts over with the new account's personal kitchen.
    func accountSwitched() {
        stopEngine()
        removeLocalKitchen()
        Self.removeState(for: .personal)
        Self.removeState(for: .household(zoneName: "", ownerName: ""))
        deleteAllMetas()
        scope = .personal
        UserDefaults.standard.set(Self.encodeScope(.personal), forKey: Self.scopeKey)
        isRunning = true
        status = .idle
        startEngine()
        afterRemoteChanges()
    }

    /// Refreshes everything that reads the kitchen after iCloud changed it.
    func afterRemoteChanges() {
        guard let kitchen, !kitchen.inMemory else { return }
        WidgetSnapshotWriter.scheduleRefresh(kitchen)
        ExpiryReminders.shared.reschedule(kitchen)
    }

    func setStatus(_ status: Status) {
        guard isRunning else { return }
        self.status = status
    }

    // MARK: Local store

    /// Runs `body` with the main context's author set to `CloudSync.author`.
    /// Pending user edits are saved (and queued) first, under their own author.
    func writeAsCloudSync(_ body: (ModelContext) -> Void) {
        guard let context = kitchen?.context else { return }
        if context.hasChanges { try? context.save() }
        localChangesSaved()
        let previous = context.author
        applying = true
        context.author = Self.author
        body(context)
        if context.hasChanges { try? context.save() }
        context.author = previous
        applying = false
        // Moves the history token past CloudSync's own transaction.
        localChangesSaved()
    }

    /// Deletes the local kitchen without queueing anything for iCloud.
    func removeLocalKitchen() {
        writeAsCloudSync { context in
            for type in CloudRecordType.allCases {
                for model in localModels(of: type).values { context.delete(model) }
            }
        }
    }

    func localModels(of type: CloudRecordType) -> [UUID: any CloudSynced] {
        guard let context = kitchen?.context else { return [:] }
        func load<T: CloudSynced>(_: T.Type) -> [UUID: any CloudSynced] {
            let models = (try? context.fetch(FetchDescriptor<T>())) ?? []
            return Dictionary(models.map { ($0.uuid, $0 as any CloudSynced) }, uniquingKeysWith: { first, _ in first })
        }
        return load(type.modelType)
    }

    nonisolated static func recordID(_ uuid: UUID, in zone: CKRecordZone.ID) -> CKRecord.ID {
        CKRecord.ID(recordName: uuid.uuidString, zoneID: zone)
    }

    nonisolated static func zoneKey(_ zone: CKRecordZone.ID) -> String { zone.ownerName + "/" + zone.zoneName }

    func metas(in zone: CKRecordZone.ID) -> [String: CloudRecordMeta] {
        guard let context = kitchen?.context else { return [:] }
        let key = Self.zoneKey(zone)
        let metas = (try? context.fetch(FetchDescriptor<CloudRecordMeta>(predicate: #Predicate { $0.zoneKey == key }))) ?? []
        return Dictionary(metas.map { ($0.recordName, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private func deleteMetas(in zone: CKRecordZone.ID) {
        let metas = metas(in: zone)
        guard !metas.isEmpty else { return }
        writeAsCloudSync { context in metas.values.forEach(context.delete) }
    }

    private func deleteAllMetas() {
        writeAsCloudSync { context in try? context.delete(model: CloudRecordMeta.self) }
    }

    // MARK: Observing the app

    private func observe() {
        guard observers.isEmpty, let kitchen else { return }
        let center = NotificationCenter.default
        // Saves that don't go through `Kitchen.changed()`, such as SwiftUI's autosave.
        observers.append(center.addObserver(forName: ModelContext.didSave, object: kitchen.context, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.localChangesSaved() }
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.becameActive() }
        })
        observers.append(center.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.resumeIfWanted() }
        })
        if Self.hasKeyValueStore {
            let store = NSUbiquitousKeyValueStore.default
            observers.append(center.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification, object: store, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.followOtherDevices() }
            })
            store.synchronize()
        }
    }

    private func becameActive() {
        guard isRunning, let engine else {
            resumeIfWanted()
            return
        }
        localChangesSaved()
        // A join or leave on another device that couldn't be followed yet.
        followOtherDevices()
        if !deferred.isEmpty {
            engine.state.add(pendingRecordZoneChanges: deferred.map { .saveRecord($0) })
            deferred = []
        }
        Task { await syncNow() }
    }

    /// Starts again after the person signed back in to iCloud.
    private func resumeIfWanted() {
        guard !isRunning, !switching, Kitchen.iCloudPreferred, kitchen?.iCloudAvailable == true else { return }
        Task {
            guard (try? await container.accountStatus()) == .available, !isRunning, Kitchen.iCloudPreferred else { return }
            start()
        }
    }

    // MARK: Scope across devices

    private static let scopeKey = "cloudsync.scope"
    /// The ubiquity key-value store needs its own entitlement.
    private static var hasKeyValueStore: Bool { Entitlements.contains("com.apple.developer.ubiquity-kvstore-identifier") }

    static func encodeScope(_ scope: Scope) -> Data? { try? JSONEncoder().encode(scope) }
    static func decodeScope(_ data: Data?) -> Scope? { data.flatMap { try? JSONDecoder().decode(Scope.self, from: $0) } }

    /// Saves the scope here and for the person's other devices.
    private func publishScope() {
        let data = Self.encodeScope(scope)
        UserDefaults.standard.set(data, forKey: Self.scopeKey)
        if Self.hasKeyValueStore {
            NSUbiquitousKeyValueStore.default.set(data, forKey: Self.scopeKey)
            NSUbiquitousKeyValueStore.default.synchronize()
        }
    }

    /// Follows a join or leave made on another of the person's devices.
    private func followOtherDevices() {
        guard isRunning, !switching, Self.hasKeyValueStore,
              let remote = Self.decodeScope(NSUbiquitousKeyValueStore.default.data(forKey: Self.scopeKey)),
              remote != scope else { return }
        Task {
            switch remote {
            case .personal:
                try? await leaveHousehold()
            case .household(let zoneName, let ownerName):
                // This device's personal data is still in the personal zone, so replace, don't merge.
                try? await joinHousehold(zoneID: CKRecordZone.ID(zoneName: zoneName, ownerName: ownerName), mergeLocal: false)
            }
        }
    }

    // MARK: Files

    private static var directory: URL {
        let url = URL.applicationSupportDirectory.appending(path: "CloudSync", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static var assetDirectory: URL { URL.temporaryDirectory.appending(path: "CloudSyncAssets", directoryHint: .isDirectory) }

    private static func stateURL(for scope: Scope) -> URL {
        directory.appending(path: scope == .personal ? "cloudsync-personal.state" : "cloudsync-household.state")
    }

    static func loadState(for scope: Scope) -> CKSyncEngine.State.Serialization? {
        (try? Data(contentsOf: stateURL(for: scope))).flatMap { try? JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: $0) }
    }

    func saveState(_ state: CKSyncEngine.State.Serialization) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: Self.stateURL(for: scope), options: .atomic)
    }

    static func removeState(for scope: Scope) { removeFile(stateURL(for: scope)) }

    private static var historyTokenURL: URL { directory.appending(path: "cloudsync-history.token") }

    private static func loadHistoryToken() -> DefaultHistoryToken? {
        (try? Data(contentsOf: historyTokenURL)).flatMap { try? JSONDecoder().decode(DefaultHistoryToken.self, from: $0) }
    }

    func saveHistoryToken() {
        guard let historyToken else {
            Self.removeFile(Self.historyTokenURL)
            return
        }
        guard let data = try? JSONEncoder().encode(historyToken) else { return }
        try? data.write(to: Self.historyTokenURL, options: .atomic)
    }

    static func removeFile(_ url: URL) { try? FileManager.default.removeItem(at: url) }

    private static func removeLeftoverAssets() { removeFile(assetDirectory) }

    static func message(for error: Error) -> String {
        guard let error = error as? CKError else { return error.localizedDescription }
        switch error.code {
        case .notAuthenticated: return "Sign in to iCloud to sync."
        case .quotaExceeded: return "iCloud storage is full, so recent changes haven't synced."
        case .networkUnavailable, .networkFailure: return "Can't reach iCloud right now."
        default: return error.localizedDescription
        }
    }
}
