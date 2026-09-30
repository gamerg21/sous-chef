import { describe, expect, test, vi } from 'vitest';
import { KitchenDatabase } from '../../src/server/kitchen/database';
import { runExpiryDigest, startExpiryDigestScheduler } from '../../src/server/kitchen/expiryDigest';
import type { Email } from '../../src/server/kitchen/email';
import { api, internal } from '../../src/lib/kitchen/api';
import { kitchenTest } from './harness';

const env = { RESEND_API_KEY: 're_test', APP_URL: 'https://kitchen.example.com' };
// 09:00 in UTC on 10 March 2026.
const morning = new Date('2026-03-10T09:00:00Z');

async function setup(options: { digest?: boolean; timezone?: string; demo?: boolean; expiresOn?: string } = {}) {
  const database = new KitchenDatabase(':memory:');
  const t = kitchenTest(database);
  await t.mutation(internal.units.seed, {});
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Cook', email: 'cook@example.com', demoExpiresAt: options.demo ? Date.now() + 86400000 : undefined });
    const householdId = await ctx.db.insert('households', { name: 'Kitchen' });
    await ctx.db.insert('householdMembers', { userId, householdId, role: 'owner' });
    await ctx.db.insert('shoppingLists', { householdId });
    const locationId = await ctx.db.insert('kitchenLocations', { householdId, name: 'Fridge' });
    const foodItemId = await ctx.db.insert('foodItems', { name: 'Milk' });
    const itemId = await ctx.db.insert('inventoryItems', { householdId, foodItemId, locationId, quantity: 1, unit: 'each', expiresOn: options.expiresOn ?? '2026-03-11' });
    await ctx.db.insert('userPreferences', { userId, measurementSystem: 'metric', defaultWeightUnit: 'g', defaultVolumeUnit: 'ml', timezone: options.timezone ?? 'UTC', expiryDigestEmail: options.digest ?? true });
    return { userId, householdId, itemId };
  });
  const sent: Email[] = [];
  const send = async (email: Email) => { sent.push(email); };
  return { database, t, ...ids, sent, send, asUser: t.withIdentity({ subject: `${ids.userId}|session` }) };
}

describe('daily expiry digest', () => {
  test('sends once per local day, even across restarts and repeated checks', async () => {
    const kitchen = await setup();
    expect(await runExpiryDigest({ database: kitchen.database, now: morning, env, send: kitchen.send })).toBe(1);
    expect(await runExpiryDigest({ database: kitchen.database, now: new Date('2026-03-10T15:00:00Z'), env, send: kitchen.send })).toBe(0);
    expect(kitchen.sent).toHaveLength(1);
    expect(kitchen.sent[0].to).toBe('cook@example.com');
    expect(kitchen.sent[0].subject).toBe('Use it up: Milk expires tomorrow');
    expect(kitchen.sent[0].text).toContain('- Milk (Fridge): expires tomorrow');
    expect(kitchen.sent[0].text).toContain('https://kitchen.example.com/cooking?filter=expiring');
    // The next day it goes out again.
    expect(await runExpiryDigest({ database: kitchen.database, now: new Date('2026-03-11T09:00:00Z'), env, send: kitchen.send })).toBe(1);
  });

  test('waits for the morning in the cook’s timezone', async () => {
    const kitchen = await setup({ timezone: 'America/Los_Angeles' });
    // 09:00 UTC is 02:00 in Los Angeles.
    expect(await runExpiryDigest({ database: kitchen.database, now: morning, env, send: kitchen.send })).toBe(0);
    expect(await runExpiryDigest({ database: kitchen.database, now: new Date('2026-03-10T16:00:00Z'), env, send: kitchen.send })).toBe(1);
  });

  test('concurrent checks never double-send', async () => {
    const kitchen = await setup();
    const results = await Promise.all([1, 2, 3].map(() => runExpiryDigest({ database: kitchen.database, now: morning, env, send: kitchen.send })));
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(kitchen.sent).toHaveLength(1);
  });

  test('retries later the same day when sending fails', async () => {
    const kitchen = await setup();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = async () => { throw new Error('offline'); };
    expect(await runExpiryDigest({ database: kitchen.database, now: morning, env, send: failing })).toBe(0);
    expect(await runExpiryDigest({ database: kitchen.database, now: morning, env, send: kitchen.send })).toBe(1);
    error.mockRestore();
  });

  test('sends nothing to people who opted out, or when nothing is expiring', async () => {
    const optedOut = await setup({ digest: false });
    expect(await runExpiryDigest({ database: optedOut.database, now: morning, env, send: optedOut.send })).toBe(0);
    const later = await setup({ expiresOn: '2026-04-30' });
    expect(await runExpiryDigest({ database: later.database, now: morning, env, send: later.send })).toBe(0);
    expect([...optedOut.sent, ...later.sent]).toEqual([]);
  });

  test('never sends in demo mode, to demo cooks, or without email configured', async () => {
    const kitchen = await setup();
    expect(await runExpiryDigest({ database: kitchen.database, now: morning, env: { ...env, SOUS_CHEF_DEMO: 'true' }, send: kitchen.send })).toBe(0);
    expect(await runExpiryDigest({ database: kitchen.database, now: morning, env: { APP_URL: env.APP_URL }, send: kitchen.send })).toBe(0);
    expect(startExpiryDigestScheduler({ ...env, SOUS_CHEF_DEMO: 'true' })).toBe(false);
    expect(startExpiryDigestScheduler({})).toBe(false);
    const demo = await setup({ demo: true });
    expect(await runExpiryDigest({ database: demo.database, now: morning, env, send: demo.send })).toBe(0);
    expect([...kitchen.sent, ...demo.sent]).toEqual([]);
  });

  test('the digest can only be turned on where email works', async () => {
    const kitchen = await setup({ digest: false });
    const saved = { ...process.env };
    try {
      delete process.env.RESEND_API_KEY;
      await expect(kitchen.asUser.mutation(api.preferences.update, { expiryDigestEmail: true })).rejects.toThrow(/Email isn/);
      Object.assign(process.env, env);
      await kitchen.asUser.mutation(api.preferences.update, { expiryDigestEmail: true, expiringWithinDays: 5 });
      const { preferences } = await kitchen.asUser.query(api.preferences.get, {});
      expect(preferences).toMatchObject({ expiryDigestEmail: true, expiryDigestAvailable: true, expiringWithinDays: 5 });
      await expect(kitchen.asUser.mutation(api.preferences.update, { expiringWithinDays: 0 })).rejects.toThrow(/between 1 and 30/);
    } finally {
      process.env = saved;
    }
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
