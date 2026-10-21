import CloudKit
import Foundation
import SwiftData

// `CKSyncEngine` callbacks and SwiftData history: what goes up, what comes down.
extension CloudSync {
    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        // Events from an engine that was replaced (a scope switch) are stale.
        guard syncEngine === engine else { return }
        switch event {
        case .stateUpdate(let update):
            saveState(update.stateSerialization)
        case .accountChange(let change):
            handleAccountChange(change)
        case .fetchedDatabaseChanges(let changes):
            handleDatabaseChanges(changes)
        case .fetchedRecordZoneChanges(let changes):
            applyFetchedChanges(changes)
        case .sentRecordZoneChanges(let sent):
            handleSentChanges(sent)
        case .sentDatabaseChanges(let sent):
            for failure in sent.failedZoneSaves where failure.zone.zoneID == activeZoneID {
                setStatus(.failed(Self.message(for: failure.error)))
            }
        case .didFetchRecordZoneChanges(let fetched):
            guard fetched.zoneID == activeZoneID, let error = fetched.error else { break }
            switch error.code {
            case .zoneNotFound, .userDeletedZone:
                // The personal zone may simply not exist yet; it's created on the next send.
                if isHouseholdMember { householdEnded() }
            default:
                setStatus(.failed(Self.message(for: error)))
            }
        case .willFetchChanges, .willSendChanges:
            setStatus(.syncing)
        case .didFetchChanges, .didSendChanges:
            if case .failed = status { break }
            setStatus(.synced(Date()))
        case .willFetchRecordZoneChanges:
            break
        @unknown default:
            break
        }
    }

    func nextFetchChangesOptions(_ context: CKSyncEngine.FetchChangesContext, syncEngine: CKSyncEngine) async -> CKSyncEngine.FetchChangesOptions {
        // Only the active kitchen: the shared database may hold other shares,
        // and the private one the old mirroring zone.
        var options = context.options
        options.scope = .zoneIDs([activeZoneID])
        return options
    }

    func nextRecordZoneChangeBatch(_ context: CKSyncEngine.SendChangesContext, syncEngine: CKSyncEngine) async -> CKSyncEngine.RecordZoneChangeBatch? {
        guard syncEngine === engine, kitchen != nil else { return nil }
        let zone = activeZoneID
        let pending = syncEngine.state.pendingRecordZoneChanges.filter { context.options.scope.contains($0) }
        guard !pending.isEmpty else { return nil }
        var models: [UUID: any CloudSynced] = [:]
        for type in CloudRecordType.allCases { models.merge(localModels(of: type)) { first, _ in first } }
        let metas = metas(in: zone)
        var toSave: [CKRecord] = [], toDelete: [CKRecord.ID] = [], dropped: [CKSyncEngine.PendingRecordZoneChange] = []
        for change in pending {
            if toSave.count + toDelete.count >= 200 { break }
            switch change {
            case .saveRecord(let id):
                guard id.zoneID == zone, let uuid = UUID(uuidString: id.recordName), let model = models[uuid],
                      let record = record(for: model, id: id, meta: metas[id.recordName]) else {
                    // Deleted since, from another zone, or nothing changed.
                    dropped.append(change)
                    continue
                }
                toSave.append(record)
            case .deleteRecord(let id):
                guard id.zoneID == zone else {
                    dropped.append(change)
                    continue
                }
                toDelete.append(id)
            @unknown default:
                dropped.append(change)
            }
        }
        if !dropped.isEmpty { syncEngine.state.remove(pendingRecordZoneChanges: dropped) }
        guard !toSave.isEmpty || !toDelete.isEmpty else { return nil }
        return CKSyncEngine.RecordZoneChangeBatch(recordsToSave: toSave, recordIDsToDelete: toDelete, atomicByZone: false)
    }

    /// The record to send for a model: on top of the version this device last
    /// saw, with only the fields changed since. Nil when nothing changed.
    private func record(for model: any CloudSynced, id: CKRecord.ID, meta: CloudRecordMeta?) -> CKRecord? {
        let type = Swift.type(of: model).cloudRecordType
        let fields = model.cloudFields
        var known: CKRecord?
        var base: CloudFields?
        if let data = meta?.systemFields, let saved = CloudRecordMapping.record(fromSystemFields: data),
           saved.recordType == type.rawValue, saved.recordID == id {
            known = saved
            base = meta?.baseFields
        }
        let digested = CloudMerge.digest(fields)
        if let base, digested == base { return nil }
        let record = known ?? CKRecord(recordType: type.rawValue, recordID: id)
        guard let files = try? CloudRecordMapping.write(fields, to: record, as: type, base: base, assetDirectory: Self.assetDirectory) else { return nil }
        inFlight.removeValue(forKey: id)?.files.forEach(Self.removeFile)
        inFlight[id] = (digested, files)
        return record
    }

    // MARK: Local changes (SwiftData history)

    /// Call after local saves: finds what changed and queues it for upload.
    func localChangesSaved() {
        guard let engine, let context = kitchen?.context, !applying else { return }
        var descriptor = HistoryDescriptor<DefaultHistoryTransaction>()
        if let token = historyToken { descriptor.predicate = #Predicate { $0.token > token } }
        guard let transactions = try? context.fetchHistory(descriptor), let latest = transactions.map(\.token).max() else { return }
        var changed: [CloudRecordType: Set<PersistentIdentifier>] = [:]
        var deleted = Set<UUID>()
        for transaction in transactions where transaction.author != Self.author {
            for change in transaction.changes {
                switch change {
                case .insert(let insert):
                    if let type = CloudRecordType(rawValue: insert.changedPersistentIdentifier.entityName) {
                        changed[type, default: []].insert(insert.changedPersistentIdentifier)
                    }
                case .update(let update):
                    if let type = CloudRecordType(rawValue: update.changedPersistentIdentifier.entityName) {
                        changed[type, default: []].insert(update.changedPersistentIdentifier)
                    }
                case .delete(let delete):
                    if let uuid = Self.deletedUUID(delete) { deleted.insert(uuid) }
                @unknown default:
                    break
                }
            }
        }
        historyToken = latest
        saveHistoryToken()
        let zone = activeZoneID
        var saved = Set<UUID>()
        for (type, ids) in changed {
            for (uuid, model) in localModels(of: type) where ids.contains(model.persistentModelID) { saved.insert(uuid) }
        }
        let deletes = deleted.subtracting(saved).map { Self.recordID($0, in: zone) }
        if !deletes.isEmpty {
            engine.state.remove(pendingRecordZoneChanges: deletes.map { .saveRecord($0) })
            engine.state.add(pendingRecordZoneChanges: deletes.map { .deleteRecord($0) })
        }
        if !saved.isEmpty {
            engine.state.add(pendingRecordZoneChanges: saved.map { .saveRecord(Self.recordID($0, in: zone)) })
        }
    }

    /// The `uuid` a deleted synced model had (kept by `.preservesValueOnDeletion`).
    private static func deletedUUID(_ delete: any HistoryDelete) -> UUID? {
        if let delete = delete as? DefaultHistoryDelete<PantryItem> { return delete.tombstone[\PantryItem.uuid] as? UUID }
        if let delete = delete as? DefaultHistoryDelete<Recipe> { return delete.tombstone[\Recipe.uuid] as? UUID }
        if let delete = delete as? DefaultHistoryDelete<ShoppingItem> { return delete.tombstone[\ShoppingItem.uuid] as? UUID }
        if let delete = delete as? DefaultHistoryDelete<PlannedMeal> { return delete.tombstone[\PlannedMeal.uuid] as? UUID }
        if let delete = delete as? DefaultHistoryDelete<PantryOutcome> { return delete.tombstone[\PantryOutcome.uuid] as? UUID }
        return nil
    }

    func latestHistoryToken() -> DefaultHistoryToken? {
        guard let context = kitchen?.context else { return nil }
        var newest = HistoryDescriptor<DefaultHistoryTransaction>(sortBy: [SortDescriptor(\.transactionIdentifier, order: .reverse)])
        newest.fetchLimit = 1
        if let token = (try? context.fetchHistory(newest))?.first?.token { return token }
        return (try? context.fetchHistory(HistoryDescriptor<DefaultHistoryTransaction>()))?.map(\.token).max()
    }

    /// Drops history CloudSync has already read, so the store doesn't grow forever.
    func pruneHistory() {
        guard let context = kitchen?.context, let token = historyToken else { return }
        try? context.deleteHistory(HistoryDescriptor<DefaultHistoryTransaction>(predicate: #Predicate { $0.token < token }))
    }

    // MARK: Fetched changes

    private func applyFetchedChanges(_ changes: CKSyncEngine.Event.FetchedRecordZoneChanges) {
        guard let engine else { return }
        let zone = activeZoneID
        let modifications = changes.modifications.filter { $0.record.recordID.zoneID == zone }
        let deletions = changes.deletions.filter { $0.recordID.zoneID == zone }
        guard !modifications.isEmpty || !deletions.isEmpty else { return }
        var touchedShopping = false
        var doomed: [any CloudSynced] = []
        writeAsCloudSync { context in
            // Read after `writeAsCloudSync` saved and queued pending local edits.
            let pending = Set(engine.state.pendingRecordZoneChanges)
            var lookup = ModelLookup(sync: self)
            var metas = metas(in: zone)
            for modification in modifications {
                let record = modification.record
                guard let type = CloudRecordType(rawValue: record.recordType), let uuid = UUID(uuidString: record.recordID.recordName) else { continue }
                let server = CloudRecordMapping.fields(from: record, as: type)
                let meta = metas[record.recordID.recordName] ?? {
                    let meta = CloudRecordMeta(recordName: record.recordID.recordName, zoneKey: Self.zoneKey(zone), recordType: type.rawValue)
                    context.insert(meta)
                    metas[meta.recordName] = meta
                    return meta
                }()
                if let model = lookup.model(type, uuid) {
                    if pending.contains(.saveRecord(record.recordID)) {
                        // Unsent edits here survive: merge them over the server's copy.
                        model.applyCloudFields(CloudMerge.merge(type, local: model.cloudFields, server: server, base: meta.baseFields))
                    } else {
                        model.applyCloudFields(server)
                    }
                } else if !pending.contains(.deleteRecord(record.recordID)) {
                    let model = type.makeModel()
                    model.uuid = uuid
                    model.applyCloudFields(server)
                    model.preparedFromCloud()
                    context.insert(model)
                    lookup.inserted(model, type)
                }
                meta.systemFields = CloudRecordMapping.encodeSystemFields(of: record)
                meta.base = CloudRecordMapping.encode(CloudMerge.digest(server))
                if type == .shoppingItem { touchedShopping = true }
            }
            var dropped: [CKSyncEngine.PendingRecordZoneChange] = []
            for deletion in deletions {
                let id = deletion.recordID
                dropped.append(.saveRecord(id))
                if let meta = metas.removeValue(forKey: id.recordName) { context.delete(meta) }
                guard let type = CloudRecordType(rawValue: deletion.recordType), let uuid = UUID(uuidString: id.recordName),
                      let model = lookup.model(type, uuid) else { continue }
                // Deleted on another device: a connected companion server should drop it too.
                if let kind = type.tombstoneKind, let serverID = model.serverID, kitchen?.server.isConnected == true {
                    context.insert(Tombstone(kind: kind, serverID: serverID))
                }
                doomed.append(model)
            }
            if !dropped.isEmpty { engine.state.remove(pendingRecordZoneChanges: dropped) }
        }
        if touchedShopping { collapseShoppingDuplicates() }
        if !doomed.isEmpty { deleteRemovedElsewhere(doomed) }
        afterRemoteChanges()
    }

    /// Deletes items another device deleted. Screens showing one switch to a
    /// note first, and the delete waits a moment so none still reads it.
    private func deleteRemovedElsewhere(_ models: [any CloudSynced]) {
        kitchen?.markDeletedElsewhere(models)
        Task {
            try? await Task.sleep(for: .milliseconds(400))
            writeAsCloudSync { context in
                for model in models where model.modelContext != nil { context.delete(model) }
            }
            afterRemoteChanges()
        }
    }

    /// Merges unchecked shopping items that are the same food (two people
    /// adding "milk" at once). Saved as an ordinary edit, so the merge and the
    /// deleted duplicate reach iCloud.
    private func collapseShoppingDuplicates() {
        guard let context = kitchen?.context else { return }
        let items = (try? context.fetch(FetchDescriptor<ShoppingItem>(predicate: #Predicate { !$0.checked }))) ?? []
        let lines = items.map { ShoppingDuplicates.Line(uuid: $0.uuid, name: $0.name, unit: $0.unit, checked: $0.checked, createdAt: $0.createdAt,
                                                         quantity: $0.quantity, category: $0.category, note: $0.note) }
        let collapses = ShoppingDuplicates.find(in: lines)
        guard !collapses.isEmpty else { return }
        let byID = Dictionary(items.map { ($0.uuid, $0) }, uniquingKeysWith: { first, _ in first })
        for collapse in collapses {
            guard let keeper = byID[collapse.keep] else { continue }
            if keeper.quantity != collapse.quantity { keeper.quantity = collapse.quantity }
            if keeper.category != collapse.category { keeper.category = collapse.category }
            if keeper.note != collapse.note { keeper.note = collapse.note }
            keeper.touch()
            for id in collapse.delete {
                guard let duplicate = byID[id] else { continue }
                // Someone may have it open; their screen closes first.
                kitchen?.markDeletedElsewhere([duplicate])
                kitchen?.delete(duplicate)
            }
        }
        try? context.save()
        localChangesSaved()
    }

    // MARK: Sent changes

    private func handleSentChanges(_ sent: CKSyncEngine.Event.SentRecordZoneChanges) {
        guard let engine else { return }
        let zone = activeZoneID
        var requeue: [CKSyncEngine.PendingRecordZoneChange] = []
        var failure: String?
        var ended = false
        var mergedAny = false
        writeAsCloudSync { context in
            var metas = metas(in: zone)
            var lookup = ModelLookup(sync: self)
            func meta(for record: CKRecord) -> CloudRecordMeta {
                if let meta = metas[record.recordID.recordName] { return meta }
                let meta = CloudRecordMeta(recordName: record.recordID.recordName, zoneKey: Self.zoneKey(zone), recordType: record.recordType)
                context.insert(meta)
                metas[meta.recordName] = meta
                return meta
            }
            for record in sent.savedRecords where record.recordID.zoneID == zone {
                guard let type = CloudRecordType(rawValue: record.recordType) else { continue }
                let fields = inFlight.removeValue(forKey: record.recordID)
                fields?.files.forEach(Self.removeFile)
                let meta = meta(for: record)
                meta.systemFields = CloudRecordMapping.encodeSystemFields(of: record)
                meta.base = CloudRecordMapping.encode(fields?.fields ?? CloudMerge.digest(CloudRecordMapping.fields(from: record, as: type)))
            }
            for save in sent.failedRecordSaves where save.record.recordID.zoneID == zone {
                let id = save.record.recordID
                inFlight.removeValue(forKey: id)?.files.forEach(Self.removeFile)
                switch save.error.code {
                case .serverRecordChanged:
                    guard let serverRecord = save.error.serverRecord, let type = CloudRecordType(rawValue: serverRecord.recordType) else { break }
                    let server = CloudRecordMapping.fields(from: serverRecord, as: type)
                    let meta = meta(for: serverRecord)
                    if let uuid = UUID(uuidString: id.recordName), let model = lookup.model(type, uuid) {
                        model.applyCloudFields(CloudMerge.merge(type, local: model.cloudFields, server: server, base: meta.baseFields))
                        mergedAny = true
                    }
                    meta.systemFields = CloudRecordMapping.encodeSystemFields(of: serverRecord)
                    meta.base = CloudRecordMapping.encode(CloudMerge.digest(server))
                    requeue.append(.saveRecord(id))
                case .zoneNotFound, .userDeletedZone:
                    if isHouseholdMember {
                        ended = true
                    } else {
                        engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.personalZoneID))])
                        let meta = meta(for: save.record)
                        meta.systemFields = nil
                        meta.base = nil
                        requeue.append(.saveRecord(id))
                    }
                case .unknownItem:
                    // Gone from the server: send it again as a new record.
                    let meta = meta(for: save.record)
                    meta.systemFields = nil
                    meta.base = nil
                    requeue.append(.saveRecord(id))
                case .batchRequestFailed:
                    requeue.append(.saveRecord(id))
                case .networkFailure, .networkUnavailable, .zoneBusy, .serviceUnavailable, .notAuthenticated, .operationCancelled, .requestRateLimited:
                    // CKSyncEngine retries these itself.
                    break
                case .quotaExceeded:
                    deferred.insert(id)
                    failure = Self.message(for: save.error)
                default:
                    failure = Self.message(for: save.error)
                }
            }
            for id in sent.deletedRecordIDs {
                if let meta = metas.removeValue(forKey: id.recordName) { context.delete(meta) }
            }
            for (id, error) in sent.failedRecordDeletes {
                switch error.code {
                case .unknownItem, .zoneNotFound:
                    if let meta = metas.removeValue(forKey: id.recordName) { context.delete(meta) }
                case .networkFailure, .networkUnavailable, .zoneBusy, .serviceUnavailable, .notAuthenticated, .operationCancelled, .requestRateLimited:
                    break
                default:
                    failure = Self.message(for: error)
                }
            }
        }
        if !requeue.isEmpty { engine.state.add(pendingRecordZoneChanges: requeue) }
        if let failure { setStatus(.failed(failure)) }
        if mergedAny { afterRemoteChanges() }
        if ended { householdEnded() }
    }

    // MARK: Account and zone events

    private func handleAccountChange(_ change: CKSyncEngine.Event.AccountChange) {
        switch change.changeType {
        case .signIn:
            // Signed in (again): make sure everything here is in the zone.
            if scope == .personal { engine?.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.personalZoneID))]) }
            queueAllLocalRecords()
        case .signOut:
            // Keep the kitchen on the device; syncing resumes after signing in.
            stop()
        case .switchAccounts:
            accountSwitched()
        @unknown default:
            break
        }
    }

    private func handleDatabaseChanges(_ changes: CKSyncEngine.Event.FetchedDatabaseChanges) {
        for deletion in changes.deletions where deletion.zoneID == activeZoneID {
            switch deletion.reason {
            case .deleted, .purged:
                if isHouseholdMember { householdEnded() } else { personalZoneRemoved() }
            case .encryptedDataReset:
                if isHouseholdMember {
                    householdEnded()
                } else {
                    // The person reset their encrypted iCloud data: upload this kitchen again.
                    let metas = metas(in: activeZoneID)
                    writeAsCloudSync { context in metas.values.forEach(context.delete) }
                    engine?.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.personalZoneID))])
                    queueAllLocalRecords()
                }
            @unknown default:
                break
            }
            return
        }
    }
}

/// Finds local models by type and uuid, loading each type once.
private struct ModelLookup {
    let sync: CloudSync
    private var cache: [CloudRecordType: [UUID: any CloudSynced]] = [:]

    init(sync: CloudSync) { self.sync = sync }

    mutating func model(_ type: CloudRecordType, _ uuid: UUID) -> (any CloudSynced)? {
        if cache[type] == nil { cache[type] = sync.localModels(of: type) }
        return cache[type]?[uuid]
    }

    mutating func inserted(_ model: any CloudSynced, _ type: CloudRecordType) {
        if cache[type] == nil { cache[type] = sync.localModels(of: type) }
        cache[type]?[model.uuid] = model
    }
}
