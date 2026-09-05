import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function newTest() {
  return convexTest(schema, modules);
}

type Tester = ReturnType<typeof newTest>;

async function setupKitchen(t: Tester) {
  await t.mutation(internal.units.seed, {});
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Cook",
      email: "cook@example.com",
    });
    const householdId = await ctx.db.insert("households", { name: "Kitchen" });
    await ctx.db.insert("householdMembers", {
      userId,
      householdId,
      role: "owner",
    });
    await ctx.db.insert("shoppingLists", { householdId });
    const locationId = await ctx.db.insert("kitchenLocations", {
      householdId,
      name: "Pantry",
    });
    return { userId, householdId, locationId };
  });
  return {
    ...ids,
    asUser: t.withIdentity({ subject: `${ids.userId}|test-session` }),
  };
}

async function addInventory(
  t: Tester,
  kitchen: Awaited<ReturnType<typeof setupKitchen>>,
  name: string,
  quantity: number,
  unit: string,
) {
  return await t.run(async (ctx) => {
    const foodItemId = await ctx.db.insert("foodItems", {
      name,
      canonicalName: name.toLowerCase(),
    });
    return await ctx.db.insert("inventoryItems", {
      householdId: kitchen.householdId,
      foodItemId,
      locationId: kitchen.locationId,
      quantity,
      unit,
    });
  });
}

async function addRecipe(
  t: Tester,
  householdId: Id<"households">,
  ingredients: Array<{
    name: string;
    quantity?: number;
    unit?: string;
    note?: string;
  }>,
) {
  return await t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", {
      householdId,
      title: "Test Dish",
      visibility: "private",
      favorited: false,
    });
    for (let i = 0; i < ingredients.length; i++) {
      await ctx.db.insert("recipeIngredients", {
        recipeId,
        ...ingredients[i],
        order: i,
      });
    }
    return recipeId;
  });
}

describe("cookRecipe unit-aware deduction", () => {
  test("converts between compatible units (500 ml from a 1 l bottle)", async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const itemId = await addInventory(t, kitchen, "Milk", 1, "l");
    const recipeId = await addRecipe(t, kitchen.householdId, [
      { name: "Milk", quantity: 500, unit: "ml" },
    ]);

    const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, {
      recipeId,
    });
    expect(result.missingIngredients).toHaveLength(0);

    const item = await t.run(async (ctx) => ctx.db.get(itemId));
    expect(item?.quantity).toBeCloseTo(0.5, 5);
    expect(item?.unit).toEqual("l");
  });

  test("same-unit deduction still works and empties the row", async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const itemId = await addInventory(t, kitchen, "Eggs", 2, "each");
    const recipeId = await addRecipe(t, kitchen.householdId, [
      { name: "Eggs", quantity: 2, unit: "each" },
    ]);

    const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, {
      recipeId,
    });
    expect(result.missingIngredients).toHaveLength(0);
    const item = await t.run(async (ctx) => ctx.db.get(itemId));
    expect(item).toBeNull();
  });

  test("incompatible units skip deduction instead of subtracting nonsense", async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const itemId = await addInventory(t, kitchen, "Sugar", 500, "g");
    const recipeId = await addRecipe(t, kitchen.householdId, [
      { name: "Sugar", quantity: 2, unit: "cup" },
    ]);

    const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, {
      recipeId,
    });
    // The pantry has sugar; it is not reported missing, and the row is
    // untouched because cups→grams needs density we don't model.
    expect(result.missingIngredients).toHaveLength(0);
    const item = await t.run(async (ctx) => ctx.db.get(itemId));
    expect(item?.quantity).toEqual(500);
  });

  test("qualitative units are never deducted or marked missing", async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const recipeId = await addRecipe(t, kitchen.householdId, [
      { name: "Salt", unit: "to taste" },
    ]);

    const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, {
      recipeId,
    });
    expect(result.missingIngredients).toHaveLength(0);
  });

  test("missing ingredients are reported and pushed to the shopping list", async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const recipeId = await addRecipe(t, kitchen.householdId, [
      { name: "Butter", quantity: 2, unit: "tbsp" },
    ]);

    const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, {
      recipeId,
      addMissingToShoppingList: true,
    });
    expect(result.missingIngredients).toEqual([
      { name: "Butter", quantity: 2, unit: "tbsp" },
    ]);

    const listItems = await t.run(async (ctx) =>
      ctx.db.query("shoppingListItems").collect(),
    );
    expect(listItems).toHaveLength(1);
    expect(listItems[0]).toMatchObject({ name: "Butter", quantity: 2 });
  });
});

test('repeated ingredient rows share remaining stock and report the shortfall', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  const itemId = await addInventory(t, kitchen, 'Milk', 1, 'l');
  const recipeId = await addRecipe(t, kitchen.householdId, [
    { name: 'Milk', quantity: 750, unit: 'ml' },
    { name: 'Milk', quantity: 500, unit: 'ml' },
    { name: 'Milk', quantity: 100, unit: 'ml' },
  ]);
  const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId, addMissingToShoppingList: true });
  expect(await t.run(ctx => ctx.db.get(itemId))).toBeNull();
  expect(result.missingIngredients).toEqual([
    { name: 'Milk', quantity: 250, unit: 'ml' },
    { name: 'Milk', quantity: 100, unit: 'ml' },
  ]);
  const shopping = await kitchen.asUser.query(api.shoppingList.get, {});
  expect(shopping.items.reduce((sum, item) => sum + (item.quantity ?? 0), 0)).toBe(350);
});
