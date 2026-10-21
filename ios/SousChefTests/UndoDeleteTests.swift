import Foundation
import SwiftData
import Testing
@testable import SousChef

/// Shaking undoes a delete: the items come back with the same ids and fields.
@MainActor struct UndoDeleteTests {
    private func kitchenWithUndo() -> (Kitchen, UndoManager) {
        let kitchen = Kitchen(inMemory: true)
        let undo = kitchen.deletionUndo
        undo.groupsByEvent = false
        return (kitchen, undo)
    }

    @Test func undoBringsBackARecipeAndItsPlannedMeals() throws {
        let (kitchen, undo) = kitchenWithUndo()
        let recipe = Recipe(title: "Pesto pasta")
        recipe.tags = ["dinner", "quick"]
        kitchen.context.insert(recipe)
        kitchen.context.insert(PlannedMeal(recipe: recipe, day: "2026-10-21"))
        try kitchen.context.save()
        let id = recipe.uuid

        undo.beginUndoGrouping()
        kitchen.delete(recipe, undoable: true)
        undo.endUndoGrouping()
        kitchen.changed()
        #expect(kitchen.fetch(Recipe.self).isEmpty)
        #expect(kitchen.fetch(PlannedMeal.self).isEmpty)
        #expect(undo.undoActionName == "Pesto pasta")

        undo.undo()
        let back = try #require(kitchen.fetch(Recipe.self).first)
        #expect(back.uuid == id)
        #expect(back.title == "Pesto pasta")
        #expect(back.tags == ["dinner", "quick"])
        #expect(kitchen.fetch(PlannedMeal.self).first?.recipeUUID == id)
    }

    @Test func clearingCheckedItemsUndoesTogether() throws {
        let (kitchen, undo) = kitchenWithUndo()
        for name in ["Milk", "Eggs"] {
            let item = ShoppingItem(name: name)
            item.checked = true
            kitchen.context.insert(item)
        }
        kitchen.context.insert(ShoppingItem(name: "Bread"))
        try kitchen.context.save()

        undo.beginUndoGrouping()
        kitchen.clearChecked()
        undo.endUndoGrouping()
        #expect(kitchen.fetch(ShoppingItem.self).map(\.name) == ["Bread"])

        undo.undo()
        #expect(Set(kitchen.fetch(ShoppingItem.self).map(\.name)) == ["Milk", "Eggs", "Bread"])
    }

    @Test func deletesFromSyncAreNotUndoable() throws {
        let (kitchen, undo) = kitchenWithUndo()
        let item = PantryItem(name: "Rice")
        kitchen.context.insert(item)
        kitchen.delete(item)
        #expect(!undo.canUndo)
    }
}
