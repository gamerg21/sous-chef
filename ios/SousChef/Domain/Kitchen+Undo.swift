import Foundation
import SwiftData

/// Shake to undo a delete. Each delete the person makes registers an undo
/// that puts the items back from the same fields iCloud syncs, under the same
/// ids, so the household and other devices get them back too. Shaking shows
/// `UndoDeleteSheet`, named after the top undo ("Bring back Lemons?").
extension Kitchen {
    struct DeletedItem {
        let type: CloudRecordType
        let uuid: UUID
        let fields: CloudFields
    }

    /// Call before deleting: it copies the items while they still exist.
    /// `name` is what comes back: "Lemons", "3 checked items".
    func registerUndoDelete(_ models: [any CloudSynced], name: String) {
        guard !models.isEmpty else { return }
        let undoManager = deletionUndo
        let items = models.map { DeletedItem(type: type(of: $0).cloudRecordType, uuid: $0.uuid, fields: $0.cloudFields) }
        undoManager.registerUndo(withTarget: self) { kitchen in kitchen.restore(items) }
        undoManager.setActionName(name)
    }

    /// Puts deleted items back, skipping any already back (re-added elsewhere).
    func restore(_ items: [DeletedItem]) {
        for item in items where !exists(item) {
            let model = item.type.makeModel()
            model.uuid = item.uuid
            model.applyCloudFields(item.fields)
            context.insert(model)
        }
        changed()
    }

    private func exists(_ item: DeletedItem) -> Bool {
        func any<T: CloudSynced>(_: T.Type) -> Bool {
            let uuid = item.uuid
            return fetch(T.self).contains { $0.uuid == uuid }
        }
        return any(item.type.modelType)
    }
}
