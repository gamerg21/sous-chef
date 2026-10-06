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
  expiresOn?: string,
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
      expiresOn,
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

describe('cooking with expiring and converted stock', () => {
  test('a recipe amount a hair under the pantry amount in another unit uses the item up', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const beef = await addInventory(t, kitchen, 'Beef', 1, 'lb');
    const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Beef', quantity: 453, unit: 'g' }]);
    const preview = await kitchen.asUser.query(api.cooking.preview, { recipeId });
    expect(preview.missingIngredients).toEqual([]);
    expect(preview.deductions).toEqual([{ id: beef, name: 'Beef', quantity: 1, unit: 'lb', remaining: 0 }]);
    await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId });
    expect(await t.run(ctx => ctx.db.get(beef))).toBeNull();
  });

  test('a recipe amount a hair over the pantry amount in another unit is covered, not shopped for', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const beef = await addInventory(t, kitchen, 'Beef', 1, 'lb');
    const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Beef', quantity: 454, unit: 'g' }]);
    const preview = await kitchen.asUser.query(api.cooking.preview, { recipeId });
    expect(preview.missingIngredients).toEqual([]);
    expect(preview.availableCount).toBe(1);
    const result = await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId, addMissingToShoppingList: true });
    expect(result.missingIngredients).toEqual([]);
    expect(await t.run(ctx => ctx.db.get(beef))).toBeNull();
    expect((await kitchen.asUser.query(api.shoppingList.get, {})).items).toHaveLength(0);
  });

  test('a recipe rounding a cup to 240 ml uses the cup up', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const cream = await addInventory(t, kitchen, 'Cream', 1, 'cup');
    const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Cream', quantity: 240, unit: 'ml' }]);
    expect((await kitchen.asUser.query(api.cooking.preview, { recipeId })).missingIngredients).toEqual([]);
    await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId });
    expect(await t.run(ctx => ctx.db.get(cream))).toBeNull();
  });

  test('converted amounts still leave or ask for real differences, and same-unit amounts stay exact', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const beef = await addInventory(t, kitchen, 'Beef', 1, 'lb');
    const flour = await addInventory(t, kitchen, 'Flour', 100, 'g');
    const recipeId = await addRecipe(t, kitchen.householdId, [
      { name: 'Beef', quantity: 400, unit: 'g' },
      { name: 'Flour', quantity: 99.5, unit: 'g' },
    ]);
    await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId });
    expect((await t.run(ctx => ctx.db.get(beef)))?.quantity).toBeCloseTo(53.592 / 453.592, 6);
    expect((await t.run(ctx => ctx.db.get(flour)))?.quantity).toBeCloseTo(0.5, 6);
    const short = await addRecipe(t, kitchen.householdId, [{ name: 'Flour', quantity: 1, unit: 'g' }]);
    expect((await kitchen.asUser.query(api.cooking.preview, { recipeId: short })).missingIngredients).toEqual([{ name: 'Flour', quantity: 0.5, unit: 'g' }]);
  });

  test('warns when an expiring batch in an incomparable unit is passed over for later stock', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const bunch = await addInventory(t, kitchen, 'Cilantro', 1, 'bunch', '2026-10-07');
    const grams = await addInventory(t, kitchen, 'Cilantro', 50, 'g');
    const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Cilantro', quantity: 10, unit: 'g' }]);
    const preview = await kitchen.asUser.query(api.cooking.preview, { recipeId });
    expect(preview.deductions).toEqual([{ id: grams, name: 'Cilantro', quantity: 10, unit: 'g', remaining: 40 }]);
    expect(preview.uses).toContain(bunch);
    expect(preview.checks).toHaveLength(1);
    expect(preview.checks[0].reason).toMatch(/1 bunch expiring 2026-10-07/);
    await expect(kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId })).rejects.toThrow('Check the ingredient');
    await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId, acknowledgeManualChecks: true });
    expect((await t.run(ctx => ctx.db.get(bunch)))?.quantity).toBe(1);
    expect((await t.run(ctx => ctx.db.get(grams)))?.quantity).toBe(40);
  });

  test('no warning when the incomparable batch expires after the stock that is used', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    await addInventory(t, kitchen, 'Cilantro', 1, 'bunch', '2026-10-20');
    await addInventory(t, kitchen, 'Cilantro', 50, 'g', '2026-10-07');
    const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Cilantro', quantity: 10, unit: 'g' }]);
    expect((await kitchen.asUser.query(api.cooking.preview, { recipeId })).checks).toEqual([]);
  });

  test('uses the soonest-expiring batch first', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const later = await addInventory(t, kitchen, 'Milk', 1, 'l', '2026-10-20');
    const undated = await addInventory(t, kitchen, 'Milk', 1, 'l');
    const sooner = await addInventory(t, kitchen, 'Milk', 1, 'l', '2026-10-07');
    const recipeId = await addRecipe(t, kitchen.householdId, [{ name: 'Milk', quantity: 1500, unit: 'ml' }]);
    await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId });
    expect(await t.run(ctx => ctx.db.get(sooner))).toBeNull();
    expect((await t.run(ctx => ctx.db.get(later)))?.quantity).toBeCloseTo(0.5, 6);
    expect((await t.run(ctx => ctx.db.get(undated)))?.quantity).toBe(1);
  });

  test('a planned meal cooked at twice the recipe deducts and shops exactly what its preview showed', async () => {
    const t = newTest();
    const kitchen = await setupKitchen(t);
    const milk = await addInventory(t, kitchen, 'Milk', 1, 'l', '2026-10-07');
    const eggs = await addInventory(t, kitchen, 'Eggs', 3, 'each', '2026-10-08');
    const recipeId = await addRecipe(t, kitchen.householdId, [
      { name: 'Milk', quantity: 300, unit: 'ml' },
      { name: 'Eggs', quantity: 2, unit: 'each' },
    ]);
    await t.run(ctx => ctx.db.patch(recipeId, { servings: 2 }));
    const { id } = await kitchen.asUser.mutation(api.mealPlan.add, { date: '2026-10-06', recipeId, servings: 4 });

    const preview = await kitchen.asUser.query(api.cooking.preview, { recipeId, scale: 2 });
    const [entry] = (await kitchen.asUser.query(api.mealPlan.week, { from: '2026-10-05' })).entries;
    expect(entry.plan).toEqual(preview);
    expect(preview.missingIngredients).toEqual([{ name: 'Eggs', quantity: 1, unit: 'each' }]);
    expect(preview.deductions).toEqual([
      { id: milk, name: 'Milk', quantity: 0.6, unit: 'l', remaining: expect.closeTo(0.4, 6) },
      { id: eggs, name: 'Eggs', quantity: 3, unit: 'each', remaining: 0 },
    ]);

    const result = await kitchen.asUser.mutation(api.mealPlan.cook, { id, addMissingToShoppingList: true });
    expect(result.missingIngredients).toEqual(preview.missingIngredients);
    expect((await t.run(ctx => ctx.db.get(milk)))?.quantity).toBeCloseTo(0.4, 6);
    expect(await t.run(ctx => ctx.db.get(eggs))).toBeNull();
    const shopping = await kitchen.asUser.query(api.shoppingList.get, {});
    expect(shopping.items).toEqual([expect.objectContaining({ name: 'Eggs', quantity: 1, unit: 'each' })]);
  });
});
