import Foundation

/// Field-level three-way merge for the companion-server sync.
///
/// A record's fields are kept in the server's argument shape (`NSNull` for
/// "not set"). Its base is the server's copy as of the last pull or push, so a
/// push sends only what changed here, and a pull keeps those fields and takes
/// everything else from the server. Foundation only, so it's unit tested.
nonisolated enum SyncMerge {
    typealias Fields = [String: Any]

    static func encode(_ fields: Fields) -> Data? {
        try? JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys])
    }

    static func decode(_ data: Data?) -> Fields? {
        data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? Fields }
    }

    /// Keys whose local value differs from the base; every key without a base.
    static func changedKeys(_ local: Fields, base: Fields?) -> Set<String> {
        guard let base else { return Set(local.keys) }
        // Compare as JSON reads them back, so 4 and 4.0 or Swift and Foundation types match.
        let local = decode(encode(local)) ?? local
        return Set(local.keys.filter { !same(local[$0], base[$0]) })
    }

    static func same(_ a: Any?, _ b: Any?) -> Bool {
        guard let a, let b else { return a == nil && b == nil }
        return (a as AnyObject).isEqual(b as AnyObject)
    }

    /// What an update sends: the fields changed since the base, or all of them.
    static func changes(_ local: Fields, base: Fields?) -> Fields {
        let keys = changedKeys(local, base: base)
        return local.filter { keys.contains($0.key) }
    }

    /// A pantry update sends a new amount as `quantityDelta` from the base, so
    /// deductions made on two devices add up. Without a base, or when the unit
    /// changed too, it sends the amount itself: a delta across units means nothing.
    static func pantryChanges(_ local: Fields, base: Fields?) -> Fields {
        var fields = changes(local, base: base)
        if let quantity = fields["quantity"] as? Double, fields["unit"] == nil,
           let previous = (base?["quantity"] as? NSNumber)?.doubleValue {
            fields["quantity"] = nil
            fields["quantityDelta"] = quantity - previous
        }
        return fields
    }

    /// The base after a pull merged the server's copy into a record. Fields
    /// kept from local edits keep their old base, so they're still pushed and
    /// a pantry amount still pushes as the change made here.
    static func rebase(_ merged: Fields, base: Fields?, keeping kept: Set<String>) -> Data? {
        var fields = merged
        for key in kept { fields[key] = base?[key] }
        return encode(fields)
    }
}
