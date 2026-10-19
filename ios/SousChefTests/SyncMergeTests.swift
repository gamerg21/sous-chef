import Foundation
import Testing
@testable import SousChef

/// Field-level merging for the companion-server sync.
struct SyncMergeTests {
    private let base: SyncMerge.Fields = ["name": "Milk", "quantity": 2.0, "unit": "l", "notes": NSNull(), "checked": false]

    private func json(_ fields: SyncMerge.Fields) -> SyncMerge.Fields { SyncMerge.decode(SyncMerge.encode(fields))! }

    @Test func sendsOnlyFieldsChangedSinceTheBase() {
        let stored = json(base)
        var local = base
        local["notes"] = "Oat"
        local["checked"] = true
        let changes = SyncMerge.changes(local, base: stored)
        #expect(Set(changes.keys) == ["notes", "checked"])
        #expect(changes["notes"] as? String == "Oat")
        #expect(SyncMerge.changes(base, base: stored).isEmpty)
    }

    @Test func comparesNumbersAndNullsAsJSONDoes() {
        // A whole Double stored as JSON reads back as 2, and NSNull survives.
        #expect(SyncMerge.changedKeys(["quantity": 2.0, "servings": 4, "note": NSNull()], base: json(["quantity": 2, "servings": 4.0, "note": NSNull()])).isEmpty)
        // A key the base doesn't have counts as changed.
        #expect(SyncMerge.changedKeys(["note": NSNull()], base: [:]) == ["note"])
        // Whole arrays compare as one field.
        let ingredients: [[String: Any]] = [["name": "Flour", "quantity": 200.0], ["name": "Salt"]]
        #expect(SyncMerge.changedKeys(["ingredients": ingredients], base: json(["ingredients": ingredients])).isEmpty)
        #expect(SyncMerge.changedKeys(["ingredients": [["name": "Flour", "quantity": 250.0], ["name": "Salt"]]], base: json(["ingredients": ingredients])) == ["ingredients"])
    }

    @Test func withoutABaseEveryFieldIsSent() {
        #expect(Set(SyncMerge.changes(base, base: nil).keys) == Set(base.keys))
        #expect(SyncMerge.pantryChanges(base, base: nil)["quantity"] as? Double == 2)
        #expect(SyncMerge.pantryChanges(base, base: nil)["quantityDelta"] == nil)
    }

    @Test func pantryAmountsPushAsADelta() {
        var local = base
        local["quantity"] = 0.5
        let changes = SyncMerge.pantryChanges(local, base: json(base))
        #expect(changes["quantity"] == nil)
        #expect(changes["quantityDelta"] as? Double == -1.5)
        #expect(SyncMerge.pantryChanges(base, base: json(base)).isEmpty)
    }

    @Test func aUnitChangeSendsTheAmountItself() {
        var local = base
        local["quantity"] = 500.0
        local["unit"] = "ml"
        let changes = SyncMerge.pantryChanges(local, base: json(base))
        #expect(changes["quantity"] as? Double == 500)
        #expect(changes["unit"] as? String == "ml")
        #expect(changes["quantityDelta"] == nil)
    }

    /// Two people edit the same item offline: this device renamed it and used
    /// some, the other added a note and used some too.
    @Test func pullKeepsLocalEditsAndTakesTheRest() throws {
        let stored = json(base)
        var local = base
        local["name"] = "Oat milk"
        local["quantity"] = 1.5
        let kept = SyncMerge.changedKeys(local, base: stored)
        #expect(kept == ["name", "quantity"])

        let remote: SyncMerge.Fields = ["name": "Milk", "quantity": 1.0, "unit": "l", "notes": "Top shelf", "checked": false]
        let merged = remote.merging(local.filter { kept.contains($0.key) }) { $1 }
        #expect(merged["name"] as? String == "Oat milk")
        #expect(merged["notes"] as? String == "Top shelf")

        // The new base is the server's copy, except kept fields keep the old
        // base, so they still push and the amount pushes as this device's change.
        let rebased = try #require(SyncMerge.decode(SyncMerge.rebase(merged, base: stored, keeping: kept)))
        #expect(rebased["notes"] as? String == "Top shelf")
        #expect(rebased["name"] as? String == "Milk")
        #expect(Set(SyncMerge.changes(merged, base: rebased).keys) == ["name", "quantity"])
        #expect(SyncMerge.pantryChanges(merged, base: rebased)["quantityDelta"] as? Double == -0.5)
    }

    @Test func pullWithoutLocalEditsTakesTheServerCopy() throws {
        let remote: SyncMerge.Fields = ["name": "Milk", "quantity": 1.0, "unit": "l", "notes": "Top shelf", "checked": true]
        let rebased = try #require(SyncMerge.decode(SyncMerge.rebase(remote, base: json(base), keeping: [])))
        #expect(SyncMerge.changes(remote, base: rebased).isEmpty)
    }
}
