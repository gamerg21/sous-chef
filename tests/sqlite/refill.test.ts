import { describe, expect, test } from 'vitest';
import { kitchenTest } from './harness';
import { api } from '../../src/lib/kitchen/api';
import { findRefill, refillUpdate } from '../../src/lib/refill-match';
import type { Id } from '../../src/server/kitchen/_generated/dataModel';

async function setup(t: ReturnType<typeof kitchenTest>) {
  const ids = await t.run(async ({ db }) => {
    const userId = await db.insert('users', { name: 'Cook' });
    const householdId = await db.insert('households', { name: 'Kitchen' });
    await db.insert('householdMembers', { userId, householdId, role: 'owner' });
    for (const name of ['Pantry', 'Fridge', 'Freezer']) await db.insert('kitchenLocations', { householdId, name });
    return { userId, householdId };
  });
  return { ...ids, asUser: t.withIdentity({ subject: `${ids.userId}|session` }) };
}

describe('refilling an inventory item through the update API', () => {
  test('another brand of milk refills the row that is out instead of adding one', async () => {
    const t = kitchenTest();
    const kitchen = await setup(t);
    const created = await kitchen.asUser.mutation(api.inventory.create, { name: 'Milk', locationId: 'pantry', quantity: 1, unit: 'l', expiresOn: '2026-11-01', barcode: '111', category: 'Dairy' });
    await kitchen.asUser.mutation(api.inventory.update, { id: created.id, quantity: 0 });
    const { items } = await kitchen.asUser.query(api.inventory.list, {});
    const match = findRefill({ name: 'Brand B Milk', brand: 'Brand B', barcode: '222', unit: 'gal' }, items);
    expect(match).toMatchObject({ confidence: 'strong', out: true, defaultOn: true });
    const { id, ...changes } = refillUpdate(match!.item, { quantity: 2, unit: 'gal', locationId: 'fridge', expiresOn: '2026-12-01', category: '', notes: '', barcode: '222' });
    await kitchen.asUser.mutation(api.inventory.update, { id: id as Id<'inventoryItems'>, ...changes });
    const after = (await kitchen.asUser.query(api.inventory.list, {})).items;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: created.id, name: 'Milk', quantity: 2, unit: 'gal', locationId: 'fridge', expiresOn: '2026-12-01', barcode: '222', category: 'Dairy' });
  });

  test('an item still in stock gains the amount and keeps its date, barcode and place', async () => {
    const t = kitchenTest();
    const kitchen = await setup(t);
    const created = await kitchen.asUser.mutation(api.inventory.create, { name: 'Milk', locationId: 'fridge', quantity: 1.5, unit: 'l', expiresOn: '2026-11-30', barcode: '111' });
    const { items } = await kitchen.asUser.query(api.inventory.list, {});
    const match = findRefill({ name: 'milk', barcode: '222', unit: 'L' }, items);
    expect(match).toMatchObject({ confidence: 'strong', out: false, defaultOn: false });
    const { id, ...changes } = refillUpdate(match!.item, { quantity: 2, unit: 'l', locationId: 'pantry', expiresOn: '2026-12-20', barcode: '222' });
    expect(changes).toEqual({ quantityDelta: 2 });
    await kitchen.asUser.mutation(api.inventory.update, { id: id as Id<'inventoryItems'>, ...changes });
    const after = (await kitchen.asUser.query(api.inventory.list, {})).items;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: created.id, quantity: 3.5, unit: 'l', locationId: 'fridge', expiresOn: '2026-11-30', barcode: '111' });
  });

  test("another kitchen's member cannot refill it", async () => {
    const t = kitchenTest();
    const kitchen = await setup(t);
    const other = await setup(t);
    const created = await kitchen.asUser.mutation(api.inventory.create, { name: 'Milk', locationId: 'fridge', quantity: 0, unit: 'l' });
    await expect(other.asUser.mutation(api.inventory.update, { id: created.id, quantity: 2, unit: 'l' })).rejects.toThrow('Permission denied');
    await expect(other.asUser.mutation(api.inventory.update, { id: created.id, quantityDelta: 2 })).rejects.toThrow('Permission denied');
    await expect(t.mutation(api.inventory.update, { id: created.id, quantityDelta: 2 })).rejects.toThrow();
    expect((await kitchen.asUser.query(api.inventory.list, {})).items[0]).toMatchObject({ quantity: 0 });
    expect((await other.asUser.query(api.inventory.list, {})).items).toHaveLength(0);
  });
});
