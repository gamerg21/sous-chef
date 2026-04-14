import assert from "node:assert/strict";
import test from "node:test";

import { planCookInventoryAdjustments } from "../src/lib/cooking";

test("cook planner deducts from multiple inventory rows with same unit", () => {
  const result = planCookInventoryAdjustments(
    [
      {
        id: "ing-1",
        name: "Milk",
        quantity: 750,
        unit: "ml",
      },
    ],
    [
      { id: "inv-1", name: "Milk", quantity: 300, unit: "ml" },
      { id: "inv-2", name: "Milk", quantity: 500, unit: "ml" },
    ]
  );

  assert.deepEqual(result.missingIngredients, []);
  assert.deepEqual(
    result.inventoryUpdates.sort((a, b) => a.id.localeCompare(b.id)),
    [
      { id: "inv-1", newQuantity: 0 },
      { id: "inv-2", newQuantity: 50 },
    ]
  );
});

test("cook planner emits only deficit as missing when stock is partial", () => {
  const result = planCookInventoryAdjustments(
    [
      {
        id: "ing-1",
        name: "Flour",
        quantity: 1000,
        unit: "g",
      },
    ],
    [{ id: "inv-1", name: "Flour", quantity: 600, unit: "g" }]
  );

  assert.deepEqual(result.inventoryUpdates, [{ id: "inv-1", newQuantity: 0 }]);
  assert.deepEqual(result.missingIngredients, [
    { name: "Flour", quantity: 400, unit: "g" },
  ]);
});

test("cook planner treats optional ingredients as non-blocking", () => {
  const result = planCookInventoryAdjustments(
    [
      {
        id: "ing-1",
        name: "Salt",
        note: "to taste",
      },
    ],
    []
  );

  assert.deepEqual(result.inventoryUpdates, []);
  assert.deepEqual(result.missingIngredients, []);
});
