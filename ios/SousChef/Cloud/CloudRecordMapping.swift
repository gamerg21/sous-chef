import CloudKit
import CryptoKit
import Foundation
import SwiftData

/// One field value of a kitchen record, as CloudSync stores and compares it.
/// A missing key in `CloudFields` means "not set".
nonisolated enum CloudValue: Codable, Hashable, Sendable {
    case string(String)
    case double(Double)
    case int(Int64)
    case bool(Bool)
    case date(Date)
    case bytes(Data)
    case strings([String])
}

/// A record's synced fields by name (the model's property names).
typealias CloudFields = [String: CloudValue]

/// The CloudKit record types: one per synced model, named after it.
nonisolated enum CloudRecordType: String, CaseIterable, Sendable {
    case pantryItem = "PantryItem"
    case recipe = "Recipe"
    case shoppingItem = "ShoppingItem"
    case plannedMeal = "PlannedMeal"
    case pantryOutcome = "PantryOutcome"

    enum Kind: Sendable {
        case string, double, int, bool, date, bytes, strings
        /// Large data (photos), sent as a `CKAsset`.
        case asset
    }

    /// Every synced field and how it's stored in a `CKRecord`. Device-local
    /// properties (`needsPush`, `syncBase`, `photoNeedsUpload`,
    /// `syncedFavorited`) are deliberately absent.
    var schema: [String: Kind] {
        switch self {
        case .pantryItem:
            ["name": .string, "brand": .string, "locationRaw": .string, "quantity": .double, "unit": .string,
             "expiresOn": .date, "category": .string, "notes": .string, "barcode": .string, "photo": .asset,
             "nutritionJSON": .bytes, "foodFactsJSON": .bytes, "createdAt": .date, "updatedAt": .date, "serverID": .string]
        case .recipe:
            ["title": .string, "summary": .string, "tags": .strings, "servings": .int, "totalTimeMinutes": .int,
             "caloriesKcal": .double, "proteinGrams": .double, "carbsGrams": .double, "fatGrams": .double,
             "sourceURL": .string, "notes": .string, "favorited": .bool, "lastCookedAt": .date, "photo": .asset,
             "remotePhotoPath": .string, "ingredientsJSON": .bytes, "stepsJSON": .bytes, "communityAuthor": .string,
             "createdAt": .date, "updatedAt": .date, "serverID": .string]
        case .shoppingItem:
            ["name": .string, "quantity": .double, "unit": .string, "category": .string, "checked": .bool, "note": .string,
             "sourceRaw": .string, "recipeUUID": .string, "recipeServerID": .string, "createdAt": .date, "updatedAt": .date,
             "serverID": .string]
        case .plannedMeal:
            ["day": .string, "slotRaw": .string, "recipeUUID": .string, "recipeServerID": .string, "servings": .int,
             "note": .string, "cookedAt": .date, "createdAt": .date, "updatedAt": .date, "serverID": .string]
        case .pantryOutcome:
            ["name": .string, "outcomeRaw": .string, "on": .string, "expiresOn": .string, "createdAt": .date, "serverID": .string]
        }
    }
}

// MARK: Models <-> fields

/// A model CloudSync keeps in a CloudKit zone, one record per model, named by `uuid`.
protocol CloudSynced: PersistentModel {
    static var cloudRecordType: CloudRecordType { get }
    var uuid: UUID { get set }
    var serverID: String? { get }
    var cloudFields: CloudFields { get }
    func applyCloudFields(_ fields: CloudFields)
    /// Device-local state for a model CloudSync just inserted from iCloud.
    func preparedFromCloud()
}

extension CloudSynced {
    func preparedFromCloud() {}
}

extension CloudRecordType {
    var modelType: any CloudSynced.Type {
        switch self {
        case .pantryItem: PantryItem.self
        case .recipe: Recipe.self
        case .shoppingItem: ShoppingItem.self
        case .plannedMeal: PlannedMeal.self
        case .pantryOutcome: PantryOutcome.self
        }
    }

    func makeModel() -> any CloudSynced {
        switch self {
        case .pantryItem: PantryItem(name: "")
        case .recipe: Recipe(title: "")
        case .shoppingItem: ShoppingItem(name: "")
        case .plannedMeal: PlannedMeal(day: "")
        case .pantryOutcome: PantryOutcome(name: "", outcome: .used, on: "")
        }
    }

    /// The companion server's tombstone kind, for types the device deletes on the server.
    var tombstoneKind: SyncKind? {
        switch self {
        case .pantryItem: .pantry
        case .recipe: .recipe
        case .shoppingItem: .shopping
        case .plannedMeal: .mealPlan
        case .pantryOutcome: nil
        }
    }
}

/// Builds `CloudFields`, leaving out values that aren't set.
nonisolated struct CloudFieldWriter {
    private(set) var fields = CloudFields()

    mutating func set(_ key: String, _ value: String?) { fields[key] = value.map(CloudValue.string) }
    mutating func set(_ key: String, _ value: Double?) { fields[key] = value.map(CloudValue.double) }
    mutating func set(_ key: String, _ value: Int?) { fields[key] = value.map { .int(Int64($0)) } }
    mutating func set(_ key: String, _ value: Bool) { fields[key] = .bool(value) }
    mutating func set(_ key: String, _ value: Date?) { fields[key] = value.map(CloudValue.date) }
    mutating func set(_ key: String, _ value: Data?) { fields[key] = value.map(CloudValue.bytes) }
    mutating func set(_ key: String, _ value: [String]) { fields[key] = value.isEmpty ? nil : .strings(value) }
    mutating func set(_ key: String, _ value: UUID?) { fields[key] = value.map { .string($0.uuidString) } }
}

/// Reads `CloudFields` back as Swift values.
nonisolated struct CloudFieldReader {
    let fields: CloudFields

    func string(_ key: String) -> String? { if case .string(let value) = fields[key] { value } else { nil } }
    func double(_ key: String) -> Double? {
        switch fields[key] {
        case .double(let value): value
        case .int(let value): Double(value)
        default: nil
        }
    }
    func int(_ key: String) -> Int? {
        switch fields[key] {
        case .int(let value): Int(value)
        case .double(let value): Int(value)
        default: nil
        }
    }
    func bool(_ key: String) -> Bool? {
        switch fields[key] {
        case .bool(let value): value
        case .int(let value): value != 0
        default: nil
        }
    }
    func date(_ key: String) -> Date? { if case .date(let value) = fields[key] { value } else { nil } }
    func data(_ key: String) -> Data? { if case .bytes(let value) = fields[key] { value } else { nil } }
    func strings(_ key: String) -> [String] { if case .strings(let value) = fields[key] { value } else { [] } }
    func uuid(_ key: String) -> UUID? { string(key).flatMap(UUID.init(uuidString:)) }
}

extension PantryItem: CloudSynced {
    static var cloudRecordType: CloudRecordType { .pantryItem }

    var cloudFields: CloudFields {
        var writer = CloudFieldWriter()
        writer.set("name", name)
        writer.set("brand", brand)
        writer.set("locationRaw", locationRaw)
        writer.set("quantity", quantity)
        writer.set("unit", unit)
        writer.set("expiresOn", expiresOn)
        writer.set("category", category)
        writer.set("notes", notes)
        writer.set("barcode", barcode)
        writer.set("photo", photo)
        writer.set("nutritionJSON", nutritionJSON)
        writer.set("foodFactsJSON", foodFactsJSON)
        writer.set("createdAt", createdAt)
        writer.set("updatedAt", updatedAt)
        writer.set("serverID", serverID)
        return writer.fields
    }

    func applyCloudFields(_ fields: CloudFields) {
        let reader = CloudFieldReader(fields: fields)
        name = reader.string("name") ?? ""
        brand = reader.string("brand")
        locationRaw = reader.string("locationRaw") ?? StorageLocation.pantry.rawValue
        quantity = reader.double("quantity") ?? 1
        unit = reader.string("unit") ?? "each"
        expiresOn = reader.date("expiresOn")
        category = reader.string("category")
        notes = reader.string("notes")
        barcode = reader.string("barcode")
        let newPhoto = reader.data("photo")
        if photo != newPhoto { photo = newPhoto }
        nutritionJSON = reader.data("nutritionJSON")
        foodFactsJSON = reader.data("foodFactsJSON")
        createdAt = reader.date("createdAt") ?? createdAt
        updatedAt = reader.date("updatedAt") ?? updatedAt
        serverID = reader.string("serverID")
    }

    func preparedFromCloud() { needsPush = serverID == nil }
}

extension Recipe: CloudSynced {
    static var cloudRecordType: CloudRecordType { .recipe }

    var cloudFields: CloudFields {
        var writer = CloudFieldWriter()
        writer.set("title", title)
        writer.set("summary", summary)
        writer.set("tags", tags)
        writer.set("servings", servings)
        writer.set("totalTimeMinutes", totalTimeMinutes)
        writer.set("caloriesKcal", caloriesKcal)
        writer.set("proteinGrams", proteinGrams)
        writer.set("carbsGrams", carbsGrams)
        writer.set("fatGrams", fatGrams)
        writer.set("sourceURL", sourceURL)
        writer.set("notes", notes)
        writer.set("favorited", favorited)
        writer.set("lastCookedAt", lastCookedAt)
        writer.set("photo", photo)
        writer.set("remotePhotoPath", remotePhotoPath)
        writer.set("ingredientsJSON", ingredientsJSON)
        writer.set("stepsJSON", stepsJSON)
        writer.set("communityAuthor", communityAuthor)
        writer.set("createdAt", createdAt)
        writer.set("updatedAt", updatedAt)
        writer.set("serverID", serverID)
        return writer.fields
    }

    func applyCloudFields(_ fields: CloudFields) {
        let reader = CloudFieldReader(fields: fields)
        title = reader.string("title") ?? ""
        summary = reader.string("summary")
        tags = reader.strings("tags")
        servings = reader.int("servings")
        totalTimeMinutes = reader.int("totalTimeMinutes")
        caloriesKcal = reader.double("caloriesKcal")
        proteinGrams = reader.double("proteinGrams")
        carbsGrams = reader.double("carbsGrams")
        fatGrams = reader.double("fatGrams")
        sourceURL = reader.string("sourceURL")
        notes = reader.string("notes")
        favorited = reader.bool("favorited") ?? false
        lastCookedAt = reader.date("lastCookedAt")
        let newPhoto = reader.data("photo")
        if photo != newPhoto { photo = newPhoto }
        remotePhotoPath = reader.string("remotePhotoPath")
        ingredientsJSON = reader.data("ingredientsJSON")
        stepsJSON = reader.data("stepsJSON")
        communityAuthor = reader.string("communityAuthor")
        createdAt = reader.date("createdAt") ?? createdAt
        updatedAt = reader.date("updatedAt") ?? updatedAt
        serverID = reader.string("serverID")
    }

    func preparedFromCloud() {
        needsPush = serverID == nil
        photoNeedsUpload = photo != nil && remotePhotoPath == nil
    }
}

extension ShoppingItem: CloudSynced {
    static var cloudRecordType: CloudRecordType { .shoppingItem }

    var cloudFields: CloudFields {
        var writer = CloudFieldWriter()
        writer.set("name", name)
        writer.set("quantity", quantity)
        writer.set("unit", unit)
        writer.set("category", category)
        writer.set("checked", checked)
        writer.set("note", note)
        writer.set("sourceRaw", sourceRaw)
        writer.set("recipeUUID", recipeUUID)
        writer.set("recipeServerID", recipeServerID)
        writer.set("createdAt", createdAt)
        writer.set("updatedAt", updatedAt)
        writer.set("serverID", serverID)
        return writer.fields
    }

    func applyCloudFields(_ fields: CloudFields) {
        let reader = CloudFieldReader(fields: fields)
        name = reader.string("name") ?? ""
        quantity = reader.double("quantity")
        unit = reader.string("unit")
        category = reader.string("category")
        checked = reader.bool("checked") ?? false
        note = reader.string("note")
        sourceRaw = reader.string("sourceRaw") ?? ShoppingSource.manual.rawValue
        recipeUUID = reader.uuid("recipeUUID")
        recipeServerID = reader.string("recipeServerID")
        createdAt = reader.date("createdAt") ?? createdAt
        updatedAt = reader.date("updatedAt") ?? updatedAt
        serverID = reader.string("serverID")
    }

    func preparedFromCloud() { needsPush = serverID == nil }
}

extension PlannedMeal: CloudSynced {
    static var cloudRecordType: CloudRecordType { .plannedMeal }

    var cloudFields: CloudFields {
        var writer = CloudFieldWriter()
        writer.set("day", day)
        writer.set("slotRaw", slotRaw)
        writer.set("recipeUUID", recipeUUID)
        writer.set("recipeServerID", recipeServerID)
        writer.set("servings", servings)
        writer.set("note", note)
        writer.set("cookedAt", cookedAt)
        writer.set("createdAt", createdAt)
        writer.set("updatedAt", updatedAt)
        writer.set("serverID", serverID)
        return writer.fields
    }

    func applyCloudFields(_ fields: CloudFields) {
        let reader = CloudFieldReader(fields: fields)
        day = reader.string("day") ?? ""
        slotRaw = reader.string("slotRaw") ?? MealSlot.dinner.rawValue
        recipeUUID = reader.uuid("recipeUUID")
        recipeServerID = reader.string("recipeServerID")
        servings = reader.int("servings")
        note = reader.string("note")
        cookedAt = reader.date("cookedAt")
        createdAt = reader.date("createdAt") ?? createdAt
        updatedAt = reader.date("updatedAt") ?? updatedAt
        serverID = reader.string("serverID")
    }

    func preparedFromCloud() { needsPush = serverID == nil }
}

extension PantryOutcome: CloudSynced {
    static var cloudRecordType: CloudRecordType { .pantryOutcome }

    var cloudFields: CloudFields {
        var writer = CloudFieldWriter()
        writer.set("name", name)
        writer.set("outcomeRaw", outcomeRaw)
        writer.set("on", on)
        writer.set("expiresOn", expiresOn)
        writer.set("createdAt", createdAt)
        writer.set("serverID", serverID)
        return writer.fields
    }

    func applyCloudFields(_ fields: CloudFields) {
        let reader = CloudFieldReader(fields: fields)
        name = reader.string("name") ?? ""
        outcomeRaw = reader.string("outcomeRaw") ?? Kind.used.rawValue
        on = reader.string("on") ?? ""
        expiresOn = reader.string("expiresOn")
        createdAt = reader.date("createdAt") ?? createdAt
        serverID = reader.string("serverID")
    }

    func preparedFromCloud() { needsPush = serverID == nil }
}

// MARK: Fields <-> CKRecord

/// Moves `CloudFields` in and out of `CKRecord`s. Foundation and CloudKit
/// value types only, so it's unit tested without a network.
nonisolated enum CloudRecordMapping {
    /// Reads a record's fields. Assets are read into memory while the
    /// engine's file is still there.
    static func fields(from record: CKRecord, as type: CloudRecordType) -> CloudFields {
        var fields = CloudFields()
        for (key, kind) in type.schema {
            guard let raw = record[key] else { continue }
            let value: CloudValue?
            switch kind {
            case .string: value = (raw as? String).map(CloudValue.string)
            case .double: value = (raw as? NSNumber).map { .double($0.doubleValue) }
            case .int: value = (raw as? NSNumber).map { .int($0.int64Value) }
            case .bool: value = (raw as? NSNumber).map { .bool($0.boolValue) }
            case .date: value = (raw as? Date).map(CloudValue.date)
            case .bytes: value = (raw as? Data).map(CloudValue.bytes)
            case .strings: value = (raw as? [String]).flatMap { $0.isEmpty ? nil : .strings($0) }
            case .asset:
                if let url = (raw as? CKAsset)?.fileURL, let data = try? Data(contentsOf: url) { value = .bytes(data) }
                else if let data = raw as? Data { value = .bytes(data) }
                else { value = nil }
            }
            fields[key] = value
        }
        return fields
    }

    /// Writes fields into a record. With `base` (the server's fields as of the
    /// record's system fields), only fields that differ from it are written,
    /// so an unchanged photo isn't uploaded again. Returns the temporary asset
    /// files it created, for the caller to delete once the record is sent.
    @discardableResult
    static func write(_ fields: CloudFields, to record: CKRecord, as type: CloudRecordType, base: CloudFields? = nil, assetDirectory: URL) throws -> [URL] {
        let digested = base == nil ? nil : CloudMerge.digest(fields)
        var files: [URL] = []
        for (key, kind) in type.schema.sorted(by: { $0.key < $1.key }) {
            if let base, let digested, digested[key] == base[key] { continue }
            guard let value = fields[key] else {
                record[key] = nil
                continue
            }
            switch (kind, value) {
            case (.asset, .bytes(let data)):
                try FileManager.default.createDirectory(at: assetDirectory, withIntermediateDirectories: true)
                let url = assetDirectory.appending(path: "\(UUID().uuidString).asset")
                try data.write(to: url, options: .atomic)
                files.append(url)
                record[key] = CKAsset(fileURL: url)
            case (_, .string(let text)): record[key] = text as NSString
            case (_, .double(let number)): record[key] = NSNumber(value: number)
            case (_, .int(let number)): record[key] = NSNumber(value: number)
            case (_, .bool(let flag)): record[key] = NSNumber(value: flag)
            case (_, .date(let date)): record[key] = date as NSDate
            case (_, .bytes(let data)): record[key] = data as NSData
            case (_, .strings(let list)): record[key] = list as NSArray
            }
        }
        return files
    }

    static func encodeSystemFields(of record: CKRecord) -> Data {
        let coder = NSKeyedArchiver(requiringSecureCoding: true)
        record.encodeSystemFields(with: coder)
        coder.finishEncoding()
        return coder.encodedData
    }

    static func record(fromSystemFields data: Data) -> CKRecord? {
        guard let coder = try? NSKeyedUnarchiver(forReadingFrom: data) else { return nil }
        coder.requiresSecureCoding = true
        defer { coder.finishDecoding() }
        return CKRecord(coder: coder)
    }

    static func encode(_ fields: CloudFields) -> Data? { try? JSONEncoder().encode(fields) }
    static func decode(_ data: Data?) -> CloudFields? { data.flatMap { try? JSONDecoder().decode(CloudFields.self, from: $0) } }
}

// MARK: Merging

/// Three-way, field-level merge of a record edited both here and in iCloud.
/// Bases are stored digested (`digest`), so photos aren't kept twice.
nonisolated enum CloudMerge {
    /// Replaces data values with their SHA-256, for compact bases and comparisons.
    static func digest(_ fields: CloudFields) -> CloudFields {
        fields.mapValues { value in
            guard case .bytes(let data) = value else { return value }
            return .string("sha256:" + SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined())
        }
    }

    /// For each field: kept here if only this device changed it, taken from
    /// the server if only the server did. Changed on both sides, a pantry
    /// amount in an unchanged unit adds both changes (`server + (local − base)`,
    /// never below zero); `updatedAt` takes the later; anything else keeps
    /// this device's value, the latest writer. Without a base the newer
    /// record (by `updatedAt`) wins as a whole.
    static func merge(_ type: CloudRecordType, local: CloudFields, server: CloudFields, base: CloudFields?) -> CloudFields {
        guard let base else {
            let localDate = CloudFieldReader(fields: local).date("updatedAt") ?? .distantPast
            let serverDate = CloudFieldReader(fields: server).date("updatedAt") ?? .distantPast
            return localDate > serverDate ? local : server
        }
        let localDigest = digest(local), serverDigest = digest(server)
        var merged = CloudFields()
        for key in type.schema.keys {
            let localChanged = localDigest[key] != base[key]
            let serverChanged = serverDigest[key] != base[key]
            let value: CloudValue?
            if !localChanged { value = server[key] }
            else if !serverChanged || localDigest[key] == serverDigest[key] { value = local[key] }
            else if type == .pantryItem, key == "quantity",
                    local["unit"] == server["unit"], server["unit"] == base["unit"],
                    case .double(let mine) = local[key], case .double(let theirs) = server[key], case .double(let original) = base[key] {
                value = .double((max(0, theirs + mine - original) * 1000).rounded() / 1000)
            } else if key == "updatedAt", case .date(let mine) = local[key], case .date(let theirs) = server[key] {
                value = .date(max(mine, theirs))
            } else {
                value = local[key]
            }
            merged[key] = value
        }
        return merged
    }
}

// MARK: Shopping duplicates

/// Two people adding "milk" at once leave two unchecked items; after a fetch
/// they're collapsed into the older one. Pure, so it's unit tested.
nonisolated enum ShoppingDuplicates {
    struct Line: Equatable, Sendable {
        var uuid: UUID
        var name: String
        var unit: String?
        var checked: Bool
        var createdAt: Date
        var quantity: Double?
        var category: String?
        var note: String?
    }

    struct Collapse: Equatable, Sendable {
        var keep: UUID
        var quantity: Double?
        var category: String?
        var note: String?
        var delete: [UUID]
    }

    static func key(name: String, unit: String?) -> String { normalizeName(name) + "|" + normalizeName(unit) }

    static func find(in lines: [Line]) -> [Collapse] {
        let groups = Dictionary(grouping: lines.filter { !$0.checked }) { key(name: $0.name, unit: $0.unit) }
        return groups.values.filter { $0.count > 1 }.map { group in
            let sorted = group.sorted { ($0.createdAt, $0.uuid.uuidString) < ($1.createdAt, $1.uuid.uuidString) }
            let keeper = sorted[0]
            func firstFilled(_ value: (Line) -> String?) -> String? {
                sorted.lazy.compactMap(value).first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            }
            return Collapse(keep: keeper.uuid,
                            quantity: sorted.compactMap(\.quantity).max(),
                            category: firstFilled(\.category),
                            note: firstFilled(\.note),
                            delete: sorted.dropFirst().map(\.uuid))
        }.sorted { $0.keep.uuidString < $1.keep.uuidString }
    }
}
