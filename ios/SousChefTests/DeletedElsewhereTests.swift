import SwiftData
import Testing
@testable import SousChef

/// Screens about one item stop reading it once another device deletes it.
@MainActor struct DeletedElsewhereTests {
    @Test func marksAndDetectsDeletedItems() throws {
        let kitchen = Kitchen(inMemory: true)
        let kept = Recipe(title: "Pesto pasta")
        let gone = Recipe(title: "Toast")
        kitchen.context.insert(kept)
        kitchen.context.insert(gone)
        try kitchen.context.save()
        #expect(!kitchen.wasDeletedElsewhere(kept))

        kitchen.markDeletedElsewhere([gone])
        #expect(kitchen.wasDeletedElsewhere(gone))
        #expect(!kitchen.wasDeletedElsewhere(kept))

        // Once deleted and saved, it still reads as gone without touching its data.
        kitchen.context.delete(gone)
        try kitchen.context.save()
        #expect(kitchen.wasDeletedElsewhere(gone))
    }
}
