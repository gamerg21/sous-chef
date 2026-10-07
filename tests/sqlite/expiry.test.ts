import { describe, expect, test } from 'vitest';
import { KitchenDatabase } from '../../src/server/kitchen/database';
import { api, internal } from '../../src/lib/kitchen/api';
import { kitchenTest } from './harness';

async function setup(options: { timezone?: string; expiresOn?: string } = {}) {
  const database = new KitchenDatabase(':memory:');
  const t = kitchenTest(database);
  await t.mutation(internal.units.seed, {});
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Cook', email: 'cook@example.com' });
    const householdId = await ctx.db.insert('households', { name: 'Kitchen' });
    await ctx.db.insert('householdMembers', { userId, householdId, role: 'owner' });
    await ctx.db.insert('shoppingLists', { householdId });
    const locationId = await ctx.db.insert('kitchenLocations', { householdId, name: 'Fridge' });
    const foodItemId = await ctx.db.insert('foodItems', { name: 'Milk' });
    const itemId = await ctx.db.insert('inventoryItems', { householdId, foodItemId, locationId, quantity: 1, unit: 'each', expiresOn: options.expiresOn ?? '2026-03-11' });
    await ctx.db.insert('userPreferences', { userId, measurementSystem: 'metric', defaultWeightUnit: 'g', defaultVolumeUnit: 'ml', timezone: options.timezone ?? 'UTC' });
    return { userId, householdId, itemId };
  });
  return { database, t, ...ids, asUser: t.withIdentity({ subject: `${ids.userId}|session` }) };
}

describe('expiry preferences', () => {
  test('the expiring-soon window saves and is validated', async () => {
    const kitchen = await setup();
    await kitchen.asUser.mutation(api.preferences.update, { expiringWithinDays: 5 });
    const { preferences } = await kitchen.asUser.query(api.preferences.get, {});
    expect(preferences).toMatchObject({ expiringWithinDays: 5 });
    await expect(kitchen.asUser.mutation(api.preferences.update, { expiringWithinDays: 0 })).rejects.toThrow(/between 1 and 30/);
  });
});

describe('used versus wasted', () => {
  test('counts items thrown away or used up this month', async () => {
    const kitchen = await setup();
    await kitchen.asUser.mutation(api.inventory.remove, { id: kitchen.itemId, outcome: 'wasted' });
    const summary = await kitchen.asUser.query(api.expiry.outcomes, {});
    expect(summary.wasted).toBe(1);
    expect(summary.used).toBe(0);
    expect((await kitchen.asUser.query(api.expiry.outcomes, { month: '1999-01' })).wasted).toBe(0);
  });

  test('cooking a dated item to the last drop counts as used', async () => {
    const kitchen = await setup();
    const recipeId = await kitchen.t.run(async (ctx) => {
      const id = await ctx.db.insert('recipes', { householdId: kitchen.householdId, title: 'Hot milk', visibility: 'private', favorited: false });
      await ctx.db.insert('recipeIngredients', { recipeId: id, name: 'Milk', quantity: 1, unit: 'each', order: 0 });
      return id;
    });
    const { recipes } = await kitchen.asUser.query(api.cooking.whatCanICook, {});
    expect(recipes[0].plan.uses).toEqual([kitchen.itemId]);
    await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId });
    expect((await kitchen.asUser.query(api.expiry.outcomes, {})).used).toBe(1);
  });
});

describe('cooking outcomes', () => {
  async function cook(kitchen: Awaited<ReturnType<typeof setup>>, ingredient: { name: string; quantity: number; unit: string }) {
    const recipeId = await kitchen.t.run(async (ctx) => {
      const id = await ctx.db.insert('recipes', { householdId: kitchen.householdId, title: 'Dish', visibility: 'private', favorited: false });
      await ctx.db.insert('recipeIngredients', { recipeId: id, ...ingredient, order: 0 });
      return id;
    });
    await kitchen.asUser.mutation(api.cooking.cookRecipe, { recipeId });
  }
  async function addDated(kitchen: Awaited<ReturnType<typeof setup>>, name: string, quantity: number, unit: string) {
    return kitchen.t.run(async (ctx) => {
      const locationId = (await ctx.db.query('kitchenLocations').first())!._id;
      const foodItemId = await ctx.db.insert('foodItems', { name });
      return ctx.db.insert('inventoryItems', { householdId: kitchen.householdId, foodItemId, locationId, quantity, unit, expiresOn: '2026-03-12' });
    });
  }

  test('a dated pound of beef cooked as 453 g or 454 g counts as used up', async () => {
    const kitchen = await setup();
    const under = await addDated(kitchen, 'Beef', 1, 'lb');
    await cook(kitchen, { name: 'Beef', quantity: 453, unit: 'g' });
    expect(await kitchen.t.run(ctx => ctx.db.get(under))).toBeNull();
    const over = await addDated(kitchen, 'Pork', 1, 'lb');
    await cook(kitchen, { name: 'Pork', quantity: 454, unit: 'g' });
    expect(await kitchen.t.run(ctx => ctx.db.get(over))).toBeNull();
    expect((await kitchen.asUser.query(api.expiry.outcomes, {})).used).toBe(2);
  });

  test('a dated item only partly cooked is not counted', async () => {
    const kitchen = await setup();
    await addDated(kitchen, 'Beef', 1, 'lb');
    await cook(kitchen, { name: 'Beef', quantity: 200, unit: 'g' });
    expect((await kitchen.asUser.query(api.expiry.outcomes, {})).used).toBe(0);
  });
});
