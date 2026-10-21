import { describe, expect, test } from 'vitest';
import { KitchenDatabase } from '../../src/server/kitchen/database';
import { execute } from '../../src/server/kitchen/execute';
import { api, internal } from '../../src/lib/kitchen/api';
import { kitchenTest } from './harness';

// Two members of one household syncing offline edits, plus an outsider.
async function setup() {
  const database = new KitchenDatabase(':memory:');
  const t = kitchenTest(database);
  await t.mutation(internal.units.seed, {});
  const ids = await t.run(async (ctx) => {
    const alice = await ctx.db.insert('users', { name: 'Alice', email: 'alice@example.com' });
    const bob = await ctx.db.insert('users', { name: 'Bob', email: 'bob@example.com' });
    const stranger = await ctx.db.insert('users', { name: 'Stranger', email: 'stranger@example.com' });
    const householdId = await ctx.db.insert('households', { name: 'Kitchen' });
    const otherHousehold = await ctx.db.insert('households', { name: 'Elsewhere' });
    await ctx.db.insert('householdMembers', { userId: alice, householdId, role: 'owner' });
    await ctx.db.insert('householdMembers', { userId: bob, householdId, role: 'member' });
    await ctx.db.insert('householdMembers', { userId: stranger, householdId: otherHousehold, role: 'owner' });
    await ctx.db.insert('shoppingLists', { householdId });
    const locationId = await ctx.db.insert('kitchenLocations', { householdId, name: 'Fridge' });
    const foodItemId = await ctx.db.insert('foodItems', { name: 'Milk' });
    const itemId = await ctx.db.insert('inventoryItems', { householdId, foodItemId, locationId, quantity: 3, unit: 'l', expiresOn: '2026-03-11' });
    const recipeId = await ctx.db.insert('recipes', { householdId, title: 'Pancakes', visibility: 'private', favorited: false });
    for (const userId of [alice, bob]) await ctx.db.insert('userPreferences', { userId, measurementSystem: 'metric', defaultWeightUnit: 'g', defaultVolumeUnit: 'ml', timezone: 'UTC' });
    return { alice, bob, stranger, householdId, itemId, recipeId };
  });
  const as = (userId: string) => t.withIdentity({ subject: `${userId}|session` });
  const item = () => t.run(ctx => ctx.db.get(ids.itemId));
  const listRows = async () => (await as(ids.alice).query(api.shoppingList.get, {})).items;
  return { database, t, ...ids, item, listRows, asAlice: as(ids.alice), asBob: as(ids.bob), asStranger: as(ids.stranger) };
}

describe('recipes:setFavorite', () => {
  test('sets the value idempotently and leaves toggleFavorite working', async () => {
    const kitchen = await setup();
    const favorited = async () => (await kitchen.t.run(ctx => ctx.db.get(kitchen.recipeId)))?.favorited;
    expect(await kitchen.asAlice.mutation(api.recipes.setFavorite, { id: kitchen.recipeId, favorited: true })).toEqual({ favorited: true });
    // A replay, or a second member agreeing, doesn't flip it back.
    expect(await kitchen.asBob.mutation(api.recipes.setFavorite, { id: kitchen.recipeId, favorited: true })).toEqual({ favorited: true });
    expect(await favorited()).toBe(true);
    expect(await kitchen.asBob.mutation(api.recipes.setFavorite, { id: kitchen.recipeId, favorited: false })).toEqual({ favorited: false });
    expect(await kitchen.asBob.mutation(api.recipes.setFavorite, { id: kitchen.recipeId, favorited: false })).toEqual({ favorited: false });
    expect(await favorited()).toBe(false);
    expect(await kitchen.asAlice.mutation(api.recipes.toggleFavorite, { id: kitchen.recipeId })).toEqual({ favorited: true });
  });

  test('is public over HTTP and refuses other households', async () => {
    const kitchen = await setup();
    expect(await execute('recipes:setFavorite', { id: kitchen.recipeId, favorited: true }, kitchen.alice, false, kitchen.database)).toEqual({ favorited: true });
    await expect(kitchen.asStranger.mutation(api.recipes.setFavorite, { id: kitchen.recipeId, favorited: false })).rejects.toThrow('Permission denied');
    expect((await kitchen.t.run(ctx => ctx.db.get(kitchen.recipeId)))?.favorited).toBe(true);
  });
});

describe('inventory:update quantityDelta', () => {
  test('applies against the stored quantity so two members\' changes add up', async () => {
    const kitchen = await setup();
    // Both saw 3 l offline: Alice used 1, Bob bought 2.
    await kitchen.asAlice.mutation(api.inventory.update, { id: kitchen.itemId, quantityDelta: -1 });
    await kitchen.asBob.mutation(api.inventory.update, { id: kitchen.itemId, quantityDelta: 2 });
    expect(await kitchen.item()).toMatchObject({ quantity: 4, expiresOn: '2026-03-11' });
  });

  test('rounds away floating-point fuzz', async () => {
    const kitchen = await setup();
    await kitchen.t.run(async ctx => { await ctx.db.patch(kitchen.itemId, { quantity: 0.1 }); });
    await kitchen.asAlice.mutation(api.inventory.update, { id: kitchen.itemId, quantityDelta: 0.2 });
    expect((await kitchen.item())?.quantity).toBe(0.3);
    await kitchen.asAlice.mutation(api.inventory.update, { id: kitchen.itemId, quantityDelta: -0.3 });
    expect(await kitchen.item()).toMatchObject({ quantity: 0 });
    expect((await kitchen.item())?.expiresOn).toBeUndefined();
  });

  test('clamps at zero, clears the date and records the outcome once', async () => {
    const kitchen = await setup();
    await kitchen.asAlice.mutation(api.inventory.update, { id: kitchen.itemId, quantityDelta: -5, outcome: 'wasted' });
    const emptied = await kitchen.item();
    expect(emptied).toMatchObject({ quantity: 0 });
    expect(emptied?.expiresOn).toBeUndefined();
    // Bob's offline "used the rest" arrives after it's already out: not counted twice.
    await kitchen.asBob.mutation(api.inventory.update, { id: kitchen.itemId, quantityDelta: -1, outcome: 'used' });
    expect((await kitchen.item())?.quantity).toBe(0);
    expect((await kitchen.asAlice.query(api.expiry.list, {})).outcomes).toMatchObject([{ name: 'Milk', outcome: 'wasted', expiresOn: '2026-03-11' }]);
    expect(await kitchen.asAlice.query(api.expiry.outcomes, {})).toMatchObject({ used: 0, wasted: 1 });
  });

  test('rejects quantity and quantityDelta together, and other households', async () => {
    const kitchen = await setup();
    await expect(kitchen.asAlice.mutation(api.inventory.update, { id: kitchen.itemId, quantity: 1, quantityDelta: 1 })).rejects.toThrow(/either quantity or quantityDelta/);
    await expect(kitchen.asStranger.mutation(api.inventory.update, { id: kitchen.itemId, quantityDelta: -1 })).rejects.toThrow('Permission denied');
    expect((await kitchen.item())?.quantity).toBe(3);
  });
});

describe('shoppingList:addItem mergeDuplicate', () => {
  test('merges into an unchecked row with the same name and unit', async () => {
    const kitchen = await setup();
    const { id } = await kitchen.asAlice.mutation(api.shoppingList.addItem, { name: 'Oat Milk', quantity: 1, unit: 'L' });
    const merged = await kitchen.asBob.mutation(api.shoppingList.addItem, { name: '  oat   milk ', quantity: 2, unit: ' l', category: 'Dairy', note: 'Barista', mergeDuplicate: true });
    expect(merged).toEqual({ id, merged: true });
    expect(await kitchen.listRows()).toMatchObject([{ id, name: 'Oat Milk', quantity: 2, unit: 'L', category: 'Dairy', note: 'Barista' }]);
    // A smaller quantity doesn't lower it, and existing details are kept.
    await kitchen.asAlice.mutation(api.shoppingList.addItem, { name: 'oat milk', quantity: 1, unit: 'l', category: 'Drinks', note: 'Any', mergeDuplicate: true });
    expect(await kitchen.listRows()).toMatchObject([{ id, quantity: 2, category: 'Dairy', note: 'Barista' }]);
  });

  test('missing and empty units match, and a missing quantity takes the other', async () => {
    const kitchen = await setup();
    const { id } = await kitchen.asAlice.mutation(api.shoppingList.addItem, { name: 'Basil' });
    expect(await kitchen.asBob.mutation(api.shoppingList.addItem, { name: 'basil', unit: '', quantity: 3, mergeDuplicate: true })).toEqual({ id, merged: true });
    expect(await kitchen.asBob.mutation(api.shoppingList.addItem, { name: 'BASIL', mergeDuplicate: true })).toEqual({ id, merged: true });
    expect(await kitchen.listRows()).toMatchObject([{ id, quantity: 3 }]);
  });

  test('does not merge checked rows, different units, or without the flag', async () => {
    const kitchen = await setup();
    const { id: eggs } = await kitchen.asAlice.mutation(api.shoppingList.addItem, { name: 'Eggs', quantity: 6 });
    await kitchen.asAlice.mutation(api.shoppingList.updateItem, { id: eggs, checked: true });
    const unchecked = await kitchen.asBob.mutation(api.shoppingList.addItem, { name: 'eggs', quantity: 12, mergeDuplicate: true });
    expect(unchecked).toMatchObject({ merged: false });
    expect(unchecked.id).not.toBe(eggs);

    const { id: flour } = await kitchen.asAlice.mutation(api.shoppingList.addItem, { name: 'Flour', quantity: 1, unit: 'kg' });
    const grams = await kitchen.asBob.mutation(api.shoppingList.addItem, { name: 'flour', quantity: 500, unit: 'g', mergeDuplicate: true });
    expect(grams.id).not.toBe(flour);

    const plain = await kitchen.asBob.mutation(api.shoppingList.addItem, { name: 'Flour', quantity: 1, unit: 'kg' });
    expect(plain.id).not.toBe(flour);
    expect((await kitchen.listRows()).filter(row => row.name.toLowerCase() === 'flour')).toHaveLength(3);
    expect(await kitchen.listRows()).toHaveLength(5);
  });
});

describe('older servers', () => {
  test('report unknown arguments and operations with stable messages', async () => {
    const kitchen = await setup();
    await expect(execute('inventory:update', { id: kitchen.itemId, somethingNew: 1 }, kitchen.alice, false, kitchen.database)).rejects.toThrow(/^Invalid value$/);
    await expect(execute('recipes:noSuchThing', {}, kitchen.alice, false, kitchen.database)).rejects.toThrow(/^Unknown operation$/);
  });
});
