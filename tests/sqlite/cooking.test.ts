import { recipeCreatePayload, recipeUpdatePayload } from "../../src/lib/recipe-payload";
import { captureRecipe } from "../../src/lib/recipe-capture";
import { kitchenTest } from "./harness";
import { describe, expect, test } from "vitest";
import { api, internal } from "../../src/lib/kitchen/api";
import { Id } from "../../src/server/kitchen/_generated/dataModel";




function newTest() {
  return kitchenTest();
}

type Tester = ReturnType<typeof newTest>;

async function setupKitchen(t: Tester) {
  await t.mutation(internal.units.seed, {});
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Cook",
      email: `${crypto.randomUUID()}@example.com`,
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
      acknowledgeManualChecks: true,
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

test('preview and deduction agree; add-missing derives shortages and does not duplicate them', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  await addInventory(t, kitchen, 'Milk', 1, 'l');
  const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Milk', quantity: 1500, unit: 'ml' }]);
  const preview = await kitchen.asUser.query(api.cooking.preview, { recipeId });
  expect(preview.missingIngredients).toEqual([{ name: 'Milk', quantity: 500, unit: 'ml' }]);
  expect(preview.deductions[0]).toMatchObject({ quantity: 1, remaining: 0 });
  expect((await kitchen.asUser.query(api.cooking.whatCanICook, {})).recipes[0].plan).toEqual(preview);
  expect((await kitchen.asUser.mutation(api.cooking.addMissingToShoppingList, { recipeId })).added).toBe(1);
  expect((await kitchen.asUser.mutation(api.cooking.addMissingToShoppingList, { recipeId })).added).toBe(0);
  const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId, addMissingToShoppingList: true });
  expect(result.missingIngredients).toEqual(preview.missingIngredients);
  const shopping = await kitchen.asUser.query(api.shoppingList.get, {});
  expect(shopping.items).toHaveLength(1);
  expect(shopping.items[0].quantity).toBe(500);
});

test('incompatible units require acknowledgement, even when an incompatible batch precedes a usable batch', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  const grams = await addInventory(t, kitchen, 'Sugar', 500, 'g');
  await addInventory(t, kitchen, 'Sugar', 1, 'cup');
  const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Sugar', quantity: 2, unit: 'cup' }]);
  const preview = await kitchen.asUser.query(api.cooking.preview, { recipeId });
  expect(preview.checks).toHaveLength(1);
  expect(preview.deductions).toHaveLength(1);
  await expect(kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId })).rejects.toThrow('Check the ingredient');
  expect((await t.run(ctx => ctx.db.get(grams)))?.quantity).toBe(500);
});

test('purchase stocking preserves batches, consumes list items once, and rejects changed or foreign purchases atomically', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  const other = await setupKitchen(t);
  const original = await addInventory(t, kitchen, 'Milk', 1, 'l');
  const { id } = await kitchen.asUser.mutation(api.shoppingList.addItem, { name: 'Milk', quantity: 2, unit: 'l' });
  await kitchen.asUser.mutation(api.shoppingList.updateItem, { id, checked: true });
  const purchase = { id, quantity: 2, unit: 'l', locationId: kitchen.locationId, expiresOn: '2026-10-10', expectedName: 'Milk', expectedQuantity: 2, expectedUnit: 'l' };
  await expect(other.asUser.mutation(api.shoppingList.stockChecked, { items: [purchase] })).rejects.toThrow();
  await expect(kitchen.asUser.mutation(api.shoppingList.stockChecked, { items: [{ ...purchase, locationId: other.locationId }] })).rejects.toThrow('storage location');
  await expect(kitchen.asUser.mutation(api.shoppingList.stockChecked, { items: [{ ...purchase, expectedQuantity: 3 }] })).rejects.toThrow('purchase changed');
  expect((await kitchen.asUser.mutation(api.shoppingList.stockChecked, { items: [purchase] })).stocked).toBe(1);
  expect((await kitchen.asUser.mutation(api.shoppingList.stockChecked, { items: [purchase] })).stocked).toBe(0);
  expect((await t.run(ctx => ctx.db.get(original)))?.quantity).toBe(1);
  const inventory = await t.run(ctx => ctx.db.query('inventoryItems').withIndex('by_householdId', q => q.eq('householdId', kitchen.householdId)).collect());
  expect(inventory).toHaveLength(2);
  expect(inventory.find(item => item._id !== original)).toMatchObject({ quantity: 2, unit: 'l', expiresOn: '2026-10-10' });
  expect((await kitchen.asUser.query(api.shoppingList.get, {})).items).toHaveLength(0);
});


test('stocking a purchase fills an empty pantry placeholder instead of adding a batch', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  const placeholder = await addInventory(t, kitchen, 'Basil', 0, 'bunch');
  const { id } = await kitchen.asUser.mutation(api.shoppingList.addItem, { name: 'Basil', quantity: 2, unit: 'bunch' });
  await kitchen.asUser.mutation(api.shoppingList.updateItem, { id, checked: true });
  await kitchen.asUser.mutation(api.shoppingList.stockChecked, { items: [{ id, quantity: 2, unit: 'Bunch', locationId: kitchen.locationId, expectedName: 'Basil', expectedQuantity: 2, expectedUnit: 'bunch' }] });
  const inventory = await t.run(ctx => ctx.db.query('inventoryItems').withIndex('by_householdId', q => q.eq('householdId', kitchen.householdId)).collect());
  expect(inventory).toHaveLength(1);
  expect(inventory[0]).toMatchObject({ _id: placeholder, quantity: 2 });
});

test('nutrition entered for a pantry item applies to every batch of that food in the household only', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  const other = await setupKitchen(t);
  const first = await addInventory(t, kitchen, 'Rice', 1, 'kg');
  const second = await addInventory(t, kitchen, 'Rice', 0, 'kg');
  const foreign = await addInventory(t, other, 'Rice', 2, 'kg');
  await kitchen.asUser.mutation(api.inventory.update, { id: first, nutritionPer100g: { energyKcal: 360, carbsG: 80 } });
  const read = async (id: Id<'inventoryItems'>) => (await t.run(ctx => ctx.db.get(id)))?.nutritionPer100g;
  expect(await read(second)).toEqual({ energyKcal: 360, carbsG: 80 });
  expect(await read(foreign)).toBeUndefined();
  await expect(kitchen.asUser.mutation(api.inventory.update, { id: first, nutritionPer100g: { energyKcal: -1 } })).rejects.toThrow('Nutrition values');
  await kitchen.asUser.mutation(api.inventory.update, { id: second, nutritionPer100g: null });
  expect(await read(first)).toBeUndefined();
});

test('editor payload creates and edits a complete recipe, including clearing optional fields', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  const draft = captureRecipe('Pancakes\nFamily breakfast\nIngredients\n1 cup milk\nInstructions\nWarm the milk.');
  draft.servings = 2;
  const id = await kitchen.asUser.mutation(api.recipes.create, recipeCreatePayload(draft));
  const saved = await kitchen.asUser.query(api.recipes.getById, { id });
  expect(saved?.ingredients[0]).toMatchObject({ name: 'milk', quantity: 1, unit: 'cup' });
  await kitchen.asUser.mutation(api.recipes.update, { id, ...recipeUpdatePayload({ ...draft, description: undefined, servings: undefined }) });
  const updated = await kitchen.asUser.query(api.recipes.getById, { id });
  expect(updated?.description).toBeUndefined();
  expect(updated?.servings).toBeUndefined();
  expect(updated?.steps[0].text).toBe('Warm the milk.');
});

test('pantry idea preparation requires configuration and limits usage within the correct household', async () => {
  const t = newTest();
  const kitchen = await setupKitchen(t);
  const other = await setupKitchen(t);
  await addInventory(t, kitchen, 'Milk', 1, 'l');
  await addInventory(t, other, 'Private ingredient', 4, 'each');
  await expect(kitchen.asUser.mutation(internal.recipeIdeas.prepare, {})).rejects.toThrow('in Integrations');
  await t.run(ctx => ctx.db.insert('aiProviderSettings', { householdId: kitchen.householdId, providerId: 'openai', providerName: 'OpenAI', model: 'test-model', apiKey: 'test-only', status: 'ready', isActive: true }));
  const prepared = await kitchen.asUser.mutation(internal.recipeIdeas.prepare, {});
  expect(prepared.pantry).toEqual([{ name: 'Milk', quantity: 1, unit: 'l' }]);
  await kitchen.asUser.mutation(internal.recipeIdeas.prepare, {});
  await kitchen.asUser.mutation(internal.recipeIdeas.prepare, {});
  await expect(kitchen.asUser.mutation(internal.recipeIdeas.prepare, {})).rejects.toThrow('Wait a minute');
  await expect(other.asUser.mutation(internal.recipeIdeas.prepare, {})).rejects.toThrow('in Integrations');
  const publicSettings = await kitchen.asUser.query(api.aiProviders.list, {});
  expect(JSON.stringify(publicSettings)).not.toContain('test-only');
  expect(publicSettings.providers[0]).toMatchObject({ model: 'test-model', hasKey: true });
});
