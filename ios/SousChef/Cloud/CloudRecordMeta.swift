import Foundation
import SwiftData

/// What CloudSync last knew about one record in iCloud. Device-local: it's
/// never sent anywhere.
///
/// - `systemFields`: the record's CloudKit system fields
///   (`CKRecord.encodeSystemFields`), so a save goes on top of the version
///   this device last saw and conflicts are detected.
/// - `base`: the record's fields as of those system fields (digested,
///   `CloudMerge.digest`), the common ancestor for three-way merges.
@Model
final class CloudRecordMeta {
    var recordName: String = ""
    /// `CloudSync.zoneKey(_:)` of the record's zone.
    var zoneKey: String = ""
    var recordType: String = ""
    var systemFields: Data?
    var base: Data?

    init(recordName: String, zoneKey: String, recordType: String) {
        self.recordName = recordName
        self.zoneKey = zoneKey
        self.recordType = recordType
    }

    var baseFields: CloudFields? { CloudRecordMapping.decode(base) }
}
