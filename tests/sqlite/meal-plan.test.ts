import { describe, expect, test } from "vitest";
import { kitchenTest } from "./harness";
import { api, internal } from "../../src/lib/kitchen/api";
import type { Id } from "../../src/server/kitchen/_generated/dataModel";
import { combineShortages, planShortages } from "../../src/lib/cooking-plan";

type Tester = ReturnType<typeof kitchenTest>;

async function setupKitchen(t: Tester) {
  await t.mutation(internal.units.seed, {});
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Cook", email: `${crypto.randomUUID()}@example.com` });
    const householdId = await ctx.db.insert("households", { name: "Kitchen" });
    await ctx.db.insert("householdMembers", { userId, householdId, role: "owner" });
    await ctx.db.insert("shoppingLists", { householdId });
    const locationId = await ctx.db.insert("kitchenLocations", { householdId, name: "Pantry" });
    return { userId, householdId, locationId };
  });
  return { ...ids, asUser: t.withIdentity({ subject: `${ids.userId}|test-session` }) };
}
type Kitchen = Awaited<ReturnType<typeof setupKitchen>>;

async function addInventory(t: Tester, kitchen: Kitchen, name: string, quantity: number, unit: string) {
  return t.run(async (ctx) => {
    const foodItemId = await ctx.db.insert("foodItems", { name });
    return ctx.db.insert("inventoryItems", { householdId: kitchen.householdId, foodItemId, locationId: kitchen.locationId, quantity, unit });
  });
}

async function addRecipe(t: Tester, householdId: Id<"households">, title: string, ingredients: Array<{ name: string; quantity?: number; unit?: string }>, servings?: number) {
  return t.run(async (ctx) => {
    const recipeId = await ctx.db.insert("recipes", { householdId, title, visibility: "private", favorited: false, servings });
    for (const [order, ingredient] of ingredients.entries()) await ctx.db.insert("recipeIngredients", { recipeId, ...ingredient, order });
    return recipeId;
  });
}

const monday = "2026-09-28";
const catalog = [
  { labels: ["milliliter", "ml"], type: "volume", factor: 1 },
  { labels: ["liter", "l"], type: "volume", factor: 1000 },
  { labels: ["cup"], type: "volume", factor: 236.588 },
  { labels: ["gram", "g"], type: "mass", factor: 1 },
  { labels: ["kilogram", "kg"], type: "mass", factor: 1000 },
];

describe("week shortage aggregation", () => {
  test("combines the same food across units and keeps incomparable units apart", () => {
    expect(combineShortages([
      { name: "Milk", quantity: 250, unit: "ml" },
      { name: "milk ", quantity: 1, unit: "l" },
      { name: "Flour", quantity: 200, unit: "g" },
      { name: "Flour", quantity: 1, unit: "cup" },
      { name: "Flour", quantity: 0.5, unit: "kg" },
      { name: "Salt" },
      { name: "Salt", quantity: 5, unit: "g" },
    ], catalog)).toEqual([
      { name: "Milk", quantity: 1250, unit: "ml" },
      { name: "Flour", quantity: 700, unit: "g" },
      { name: "Flour", quantity: 1, unit: "cup" },
      { name: "Salt", quantity: 5, unit: "g" },
    ]);
  });

  test("subtracts the pantry once across every meal", () => {
    // 1 l in stock; two meals need 600 ml each, so 200 ml is short, not 0 or 1200.
    const shortages = planShortages(
      [[{ id: "a", name: "Milk", quantity: 600, unit: "ml" }], [{ id: "b", name: "Milk", quantity: 0.6, unit: "l" }]],
      [{ id: "s", name: "Milk", quantity: 1, unit: "l" }],
      catalog,
    );
    expect(shortages.missingIngredients).toEqual([{ name: "Milk", quantity: 0.2, unit: "l" }]);
  });
});

describe("meal plan", () => {
  test("adds, lists, updates and removes planned meals with readiness", async () => {
    const t = kitchenTest();
    const kitchen = await setupKitchen(t);
    await addInventory(t, kitchen, "Eggs", 6, "each");
    const recipeId = await addRecipe(t, kitchen.householdId, "Omelette", [{ name: "Eggs", quantity: 3, unit: "each" }], 1);
    const { id } = await kitchen.asUser.mutation(api.mealPlan.add, { date: "2026-09-30", recipeId });
    await kitchen.asUser.mutation(api.mealPlan.add, { date: "2026-10-05", recipeId, slot: "lunch" });

    const week = await kitchen.asUser.query(api.mealPlan.week, { from: monday });
    expect(week.to).toBe("2026-10-05");
    expect(week.entries).toHaveLength(1);
    expect(week.entries[0]).toMatchObject({ id, slot: "dinner", recipeTitle: "Omelette", servings: 1, cooked: false });
    expect(week.entries[0].plan?.missingIngredients).toEqual([]);
    expect(week.recipes).toEqual([{ id: recipeId, title: "Omelette", servings: 1, favorited: false }]);

    // Planned servings scale the recipe: 3 servings need 9 eggs.
    await kitchen.asUser.mutation(api.mealPlan.update, { id, servings: 3, slot: "breakfast", note: "  Birthday  " });
    const scaled = await kitchen.asUser.query(api.mealPlan.week, { from: monday });
    expect(scaled.entries[0]).toMatchObject({ slot: "breakfast", note: "Birthday", servings: 3 });
    expect(scaled.entries[0].plan?.missingIngredients).toEqual([{ name: "Eggs", quantity: 3, unit: "each" }]);

    expect((await kitchen.asUser.query(api.mealPlan.list, {})).entries).toHaveLength(2);
    await kitchen.asUser.mutation(api.mealPlan.remove, { id });
    expect((await kitchen.asUser.query(api.mealPlan.week, { from: monday })).entries).toHaveLength(0);

    await expect(kitchen.asUser.mutation(api.mealPlan.add, { date: "2026-02-30", recipeId })).rejects.toThrow("valid date");
  });

  test("only members of the recipe's kitchen can plan, see, change or cook its meals", async () => {
    const t = kitchenTest();
    const kitchen = await setupKitchen(t);
    const stranger = await setupKitchen(t);
    const recipeId = await addRecipe(t, kitchen.householdId, "Soup", [{ name: "Stock", quantity: 1, unit: "l" }]);
    const { id } = await kitchen.asUser.mutation(api.mealPlan.add, { date: monday, recipeId });

    await expect(stranger.asUser.mutation(api.mealPlan.add, { date: monday, recipeId })).rejects.toThrow("Permission denied");
    await expect(stranger.asUser.mutation(api.mealPlan.add, { date: monday, recipeId, householdId: stranger.householdId })).rejects.toThrow("Permission denied");
    await expect(stranger.asUser.query(api.mealPlan.week, { from: monday, householdId: kitchen.householdId })).rejects.toThrow("Permission denied");
    await expect(stranger.asUser.mutation(api.mealPlan.update, { id, note: "mine" })).rejects.toThrow("Permission denied");
    await expect(stranger.asUser.mutation(api.mealPlan.cook, { id })).rejects.toThrow("Permission denied");
    await expect(stranger.asUser.mutation(api.mealPlan.remove, { id })).rejects.toThrow("Permission denied");
    await expect(stranger.asUser.mutation(api.mealPlan.addWeekShortagesToShoppingList, { from: monday, householdId: kitchen.householdId })).rejects.toThrow("Permission denied");
    expect((await stranger.asUser.query(api.mealPlan.week, { from: monday })).entries).toHaveLength(0);

    // A member joining later can see it.
    const member = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { name: "Partner", email: `${crypto.randomUUID()}@example.com` });
      await ctx.db.insert("householdMembers", { userId, householdId: kitchen.householdId, role: "member" });
      return userId;
    });
    const partner = t.withIdentity({ subject: `${member}|s` });
    expect((await partner.query(api.mealPlan.week, { from: monday, householdId: kitchen.householdId })).entries).toHaveLength(1);

    // Deleting the recipe removes its planned meals.
    await kitchen.asUser.mutation(api.recipes.remove, { id: recipeId });
    expect((await kitchen.asUser.query(api.mealPlan.list, {})).entries).toHaveLength(0);
  });

  test("adds the week's combined shortages once, merging with the list", async () => {
    const t = kitchenTest();
    const kitchen = await setupKitchen(t);
    await addInventory(t, kitchen, "Milk", 1, "l");
    const pancakes = await addRecipe(t, kitchen.householdId, "Pancakes", [{ name: "Milk", quantity: 600, unit: "ml" }, { name: "Flour", quantity: 200, unit: "g" }], 2);
    const porridge = await addRecipe(t, kitchen.householdId, "Porridge", [{ name: "Milk", quantity: 0.3, unit: "l" }], 1);
    await kitchen.asUser.mutation(api.mealPlan.add, { date: monday, recipeId: pancakes, slot: "breakfast" });
    // 2 servings of a 1-serving recipe: 0.6 l.
    await kitchen.asUser.mutation(api.mealPlan.add, { date: "2026-09-29", recipeId: porridge, servings: 2 });
    const cooked = await kitchen.asUser.mutation(api.mealPlan.add, { date: "2026-09-30", recipeId: porridge });
    await kitchen.asUser.mutation(api.mealPlan.update, { id: cooked.id, cooked: true });
    // Next week's meal is outside the visible week.
    await kitchen.asUser.mutation(api.mealPlan.add, { date: "2026-10-05", recipeId: pancakes });
    // Already on the list: 100 ml of milk in the cart, and flour without an amount.
    await kitchen.asUser.mutation(api.shoppingList.addItem, { name: "Milk", quantity: 100, unit: "ml" });
    const { id: flour } = await kitchen.asUser.mutation(api.shoppingList.addItem, { name: "flour" });
    const listed = await kitchen.asUser.query(api.shoppingList.get, {});
    await kitchen.asUser.mutation(api.shoppingList.updateItem, { id: listed.items.find(item => item.name === "Milk")!.id, checked: true });

    // Pantry 1 l against 600 ml + 0.6 l: 0.2 l short in all, not per meal.
    const shortages = await kitchen.asUser.query(api.mealPlan.weekShortages, { from: monday });
    expect(shortages.meals).toBe(2);
    expect(shortages.missingIngredients).toEqual([
      { name: "Flour", quantity: 200, unit: "g" },
      { name: "Milk", quantity: 0.2, unit: "l" },
    ]);

    const first = await kitchen.asUser.mutation(api.mealPlan.addWeekShortagesToShoppingList, { from: monday });
    expect(first).toMatchObject({ added: 1, updated: 1, shortages: 2, meals: 2 });
    let items = (await kitchen.asUser.query(api.shoppingList.get, {})).items;
    expect(items).toHaveLength(3);
    expect(items.find(item => item.id === flour)).toMatchObject({ quantity: 200, unit: "g" });
    expect(items.filter(item => item.name === "Milk").map(item => [item.quantity, item.unit, item.checked])).toEqual([[100, "ml", true], [0.1, "l", false]]);

    // Running it again changes nothing.
    expect(await kitchen.asUser.mutation(api.mealPlan.addWeekShortagesToShoppingList, { from: monday })).toMatchObject({ added: 0, updated: 0 });
    expect((await kitchen.asUser.query(api.shoppingList.get, {})).items).toHaveLength(3);

    // A bigger plan tops up the open row in its own unit.
    await kitchen.asUser.mutation(api.mealPlan.add, { date: "2026-10-01", recipeId: porridge });
    expect(await kitchen.asUser.mutation(api.mealPlan.addWeekShortagesToShoppingList, { from: monday })).toMatchObject({ added: 0, updated: 1 });
    items = (await kitchen.asUser.query(api.shoppingList.get, {})).items;
    expect(items.filter(item => item.name === "Milk" && !item.checked)[0]).toMatchObject({ quantity: 0.4, unit: "l" });
  });

  test("cooking a planned meal deducts the scaled recipe atomically and only once", async () => {
    const t = kitchenTest();
    const kitchen = await setupKitchen(t);
    const milk = await addInventory(t, kitchen, "Milk", 1, "l");
    const recipeId = await addRecipe(t, kitchen.householdId, "Porridge", [{ name: "Milk", quantity: 250, unit: "ml" }, { name: "Oats" }], 1);
    const { id } = await kitchen.asUser.mutation(api.mealPlan.add, { date: monday, recipeId, servings: 2 });

    // The unspecified oats need acknowledging, as on the Cook page; nothing changes until then.
    await expect(kitchen.asUser.mutation(api.mealPlan.cook, { id })).rejects.toThrow("Check the ingredient");
    expect((await t.run(ctx => ctx.db.get(milk)))?.quantity).toBe(1);

    const result = await kitchen.asUser.mutation(api.mealPlan.cook, { id, acknowledgeManualChecks: true });
    expect(result.cooked).toBe(true);
    expect((await t.run(ctx => ctx.db.get(milk)))?.quantity).toBeCloseTo(0.5, 5);
    const [entry] = (await kitchen.asUser.query(api.mealPlan.week, { from: monday })).entries;
    expect(entry.cooked).toBe(true);
    expect((await t.run(ctx => ctx.db.get(recipeId)))?.lastCookedAt).toBeTypeOf("number");

    await expect(kitchen.asUser.mutation(api.mealPlan.cook, { id, acknowledgeManualChecks: true })).rejects.toThrow("already");
    expect((await t.run(ctx => ctx.db.get(milk)))?.quantity).toBeCloseTo(0.5, 5);
    // Cooked meals no longer count toward shortages.
    expect((await kitchen.asUser.query(api.mealPlan.weekShortages, { from: monday })).meals).toBe(0);
  });
});
