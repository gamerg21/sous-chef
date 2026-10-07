import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KitchenDatabase } from '../../src/server/kitchen/database';
import { api, internal } from '../../src/lib/kitchen/api';
import { kitchenTest } from './harness';

async function setup(options: { timezone?: string; expiresOn?: string; filename?: string } = {}) {
  const database = new KitchenDatabase(options.filename ?? ':memory:');
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

  test('removing an item that is already out does not count it again', async () => {
    const kitchen = await setup();
    await kitchen.t.run(async (ctx) => { await ctx.db.patch(kitchen.itemId, { quantity: 0 }); });
    await kitchen.asUser.mutation(api.inventory.remove, { id: kitchen.itemId, outcome: 'wasted' });
    expect((await kitchen.asUser.query(api.expiry.outcomes, {})).wasted).toBe(0);
  });

  test('settling an expired item records it once and leaves it out of stock', async () => {
    const kitchen = await setup();
    expect(await kitchen.asUser.mutation(api.expiry.settle, { id: kitchen.itemId, outcome: 'wasted' })).toEqual({ recorded: true });
    expect(await kitchen.asUser.mutation(api.expiry.settle, { id: kitchen.itemId, outcome: 'used' })).toEqual({ recorded: false });
    const { items } = await kitchen.asUser.query(api.inventory.list, {});
    expect(items).toMatchObject([{ id: kitchen.itemId, quantity: 0 }]);
    expect(items[0].expiresOn).toBeUndefined();
    expect(await kitchen.asUser.query(api.expiry.outcomes, {})).toMatchObject({ used: 0, wasted: 1 });
    expect((await kitchen.asUser.query(api.expiry.list, {})).outcomes).toMatchObject([{ expiresOn: '2026-03-11' }]);
  });

  test('marking an item down to zero clears its date, and restocking takes a new one', async () => {
    const kitchen = await setup();
    // The edit form sends the date it showed along with the new quantity.
    await kitchen.asUser.mutation(api.inventory.update, { id: kitchen.itemId, quantity: 0, expiresOn: '2026-03-11' });
    let item = await kitchen.t.run(ctx => ctx.db.get(kitchen.itemId));
    expect(item).toMatchObject({ quantity: 0 });
    expect(item?.expiresOn).toBeUndefined();
    await kitchen.asUser.mutation(api.inventory.update, { id: kitchen.itemId, expiresOn: '2026-04-01' });
    expect((await kitchen.t.run(ctx => ctx.db.get(kitchen.itemId)))?.expiresOn).toBeUndefined();
    await kitchen.asUser.mutation(api.inventory.update, { id: kitchen.itemId, quantity: 2, expiresOn: '2026-04-01' });
    item = await kitchen.t.run(ctx => ctx.db.get(kitchen.itemId));
    expect(item).toMatchObject({ quantity: 2, expiresOn: '2026-04-01' });
  });

  test('opening the database clears dates left on items that are already out', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sous-chef-'));
    try {
      const file = join(directory, 'kitchen.db');
      const kitchen = await setup({ filename: file });
      const restocked = await kitchen.t.run(async (ctx) => {
        await ctx.db.patch(kitchen.itemId, { quantity: 0 });
        const item = (await ctx.db.get(kitchen.itemId))!;
        return ctx.db.insert('inventoryItems', { householdId: item.householdId, foodItemId: item.foodItemId, locationId: item.locationId, quantity: 1, unit: 'each', expiresOn: '2026-03-20' });
      });
      const reopened = kitchenTest(new KitchenDatabase(file));
      expect((await reopened.run(ctx => ctx.db.get(kitchen.itemId)))?.expiresOn).toBeUndefined();
      expect((await reopened.run(ctx => ctx.db.get(restocked)))?.expiresOn).toBe('2026-03-20');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('outcomes recorded by another device are idempotent by client ID and listed by month', async () => {
    const kitchen = await setup();
    const outcome = { clientId: 'device-1', name: 'Yogurt', outcome: 'used' as const, on: '2026-03-10', expiresOn: '2026-03-09' };
    const first = await kitchen.asUser.mutation(api.expiry.record, { ...outcome, householdId: kitchen.householdId });
    const again = await kitchen.asUser.mutation(api.expiry.record, { ...outcome, name: 'Something else' });
    expect(again.id).toBe(first.id);
    await kitchen.asUser.mutation(api.expiry.record, { clientId: 'device-2', name: 'Milk', outcome: 'wasted', on: '2026-02-27' });
    const march = await kitchen.asUser.query(api.expiry.list, { month: '2026-03' });
    expect(march.outcomes).toEqual([{ id: first.id, clientId: 'device-1', name: 'Yogurt', outcome: 'used', on: '2026-03-10', expiresOn: '2026-03-09' }]);
    expect((await kitchen.asUser.query(api.expiry.list, { month: '2026-02' })).outcomes.map(row => row.name)).toEqual(['Milk']);
    expect(await kitchen.asUser.query(api.expiry.outcomes, { month: '2026-03' })).toMatchObject({ used: 1, wasted: 0 });
    await expect(kitchen.asUser.mutation(api.expiry.record, { ...outcome, clientId: 'device-3', on: 'today' })).rejects.toThrow(/YYYY-MM-DD/);
  });

  test("another kitchen's outcomes stay private", async () => {
    const kitchen = await setup();
    const otherHousehold = await kitchen.t.run(async (ctx) => ctx.db.insert('households', { name: 'Elsewhere' }));
    await expect(kitchen.asUser.mutation(api.expiry.record, { householdId: otherHousehold, clientId: 'x', name: 'Milk', outcome: 'used', on: '2026-03-10' })).rejects.toThrow(/Permission denied/);
    await expect(kitchen.asUser.query(api.expiry.list, { householdId: otherHousehold })).rejects.toThrow(/Permission denied/);
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
