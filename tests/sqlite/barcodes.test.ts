import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { kitchenTest } from './harness';
import { api } from '../../src/lib/kitchen/api';

async function kitchen(t: ReturnType<typeof kitchenTest>, role: 'owner' | 'member' = 'owner') {
  const id = await t.run(async ({ db }) => {
    const userId = await db.insert('users', { name: 'Barcode tester' });
    const householdId = await db.insert('households', { name: 'Kitchen' });
    await db.insert('householdMembers', { userId, householdId, role });
    await db.insert('kitchenLocations', { householdId, name: 'Pantry' });
    return userId;
  });
  return t.withIdentity({ subject: id });
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const code = '3017620422003';
const response = () => Response.json({ status: 1, product: { product_name: 'Test spread', brands: 'Test brand', categories_tags: ['en:snacks'], nutriments: { proteins_100g: 6 } } });

describe('Open Food Facts integration', () => {
  test('preferences persist per household and members cannot change them', async () => {
    const t = kitchenTest();
    const owner = await kitchen(t);
    const other = await kitchen(t);
    const member = await kitchen(t, 'member');
    expect((await owner.query(api.barcodes.settings, {})).effectiveEnabled).toBe(true);
    await owner.mutation(api.barcodes.configure, { enabled: false });
    expect((await owner.query(api.barcodes.settings, {})).effectiveEnabled).toBe(false);
    expect((await other.query(api.barcodes.settings, {})).effectiveEnabled).toBe(true);
    await expect(member.mutation(api.barcodes.configure, { enabled: false })).rejects.toThrow(/owners and admins/);
    await expect(t.query(api.barcodes.settings, {})).rejects.toThrow(/authenticated/);
  });

  test('disabled household or server never calls the external API', async () => {
    const t = kitchenTest(); const owner = await kitchen(t);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await owner.mutation(api.barcodes.configure, { enabled: false });
    expect((await owner.action(api.barcodes.lookup, { code })).found).toBe(false);
    await owner.mutation(api.barcodes.configure, { enabled: true });
    vi.stubEnv('OPEN_FOOD_FACTS_ENABLED', 'false');
    expect((await owner.query(api.barcodes.settings, {})).effectiveEnabled).toBe(false);
    expect((await owner.action(api.barcodes.lookup, { code })).found).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('looks up products, preserves attribution, and reuses cache while disabled', async () => {
    const t = kitchenTest(); const owner = await kitchen(t);
    const fetcher = vi.fn().mockImplementation(response); vi.stubGlobal('fetch', fetcher);
    const result = await owner.action(api.barcodes.lookup, { code });
    expect(result.prefill).toEqual({ barcode: code, name: 'Test spread', category: 'Snacks' });
    expect(result.attribution?.license).toBe('ODbL');
    expect(fetcher.mock.calls[0][1].headers['User-Agent']).toContain('SousChef/');
    await owner.mutation(api.barcodes.configure, { enabled: false });
    expect((await owner.action(api.barcodes.lookup, { code })).prefill.name).toBe('Test spread');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('returns no match for missing products and rejects malformed barcodes before fetch', async () => {
    const t = kitchenTest(); const owner = await kitchen(t);
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 404 })); vi.stubGlobal('fetch', fetcher);
    expect((await owner.action(api.barcodes.lookup, { code })).found).toBe(false);
    await expect(owner.action(api.barcodes.lookup, { code: '../invalid' })).rejects.toThrow(/8–14 digits/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('uses stale saved results if the service is unavailable', async () => {
    const t = kitchenTest(); const owner = await kitchen(t);
    const fetcher = vi.fn().mockImplementationOnce(response).mockRejectedValue(new Error('Network unavailable'));
    vi.stubGlobal('fetch', fetcher);
    await owner.action(api.barcodes.lookup, { code });
    vi.stubEnv('OPEN_FOOD_FACTS_CACHE_TTL_DAYS', '0');
    const result = await owner.action(api.barcodes.lookup, { code });
    expect(result.stale).toBe(true);
    expect(result.prefill.name).toBe('Test spread');
  });

  test('brings the package size, servings and storage, and the inventory lists them', async () => {
    const t = kitchenTest(); const owner = await kitchen(t);
    const fixture = readFileSync(new URL('../fixtures/open-food-facts/049000028911.json', import.meta.url), 'utf8');
    const fetcher = vi.fn().mockImplementation(() => new Response(fixture, { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await owner.action(api.barcodes.lookup, { code: '049000028911' });
    expect(String(fetcher.mock.calls[0][0])).toContain('fields=code,product_name');
    expect(result.facts).toMatchObject({
      packaging: { count: 12, container: 'can', amount: 144, unit: 'fl oz' },
      serving: { amount: 355, unit: 'ml', perPackage: 12 },
      nutritionBasis: '100ml',
      storage: 'pantry',
    });
    const { items } = await owner.query(api.inventory.list, {});
    expect(items).toEqual([]);
    await owner.mutation(api.inventory.create, { name: 'Diet Coke', locationId: 'pantry', quantity: 12, unit: 'can', barcode: '049000028911' });
    const listed = (await owner.query(api.inventory.list, {})).items[0];
    expect(listed.foodFacts).toMatchObject({ packaging: { count: 12 }, serving: { perPackage: 12 } });
  });

  test('refetches lookups saved before package details, clearing what the product dropped', async () => {
    const t = kitchenTest(); const owner = await kitchen(t);
    await t.run(async ({ db }) => {
      const foodItemId = await db.insert('foodItems', { name: 'Test spread' });
      await db.insert('barcodes', {
        foodItemId, code, type: 'EAN13', source: 'OPEN_FOOD_FACTS', manualLocked: false,
        brand: 'Old brand', ecoscoreGrade: 'b', nutritionPer100g: { 'proteins_100g': 6 }, lastSyncedAt: Date.now(),
      });
    });
    const fetcher = vi.fn().mockImplementation(() => Response.json({ status: 1, product: { product_name: 'Test spread', brands: 'Test brand', quantity: '400 g', product_quantity: 400, product_quantity_unit: 'g' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await owner.action(api.barcodes.lookup, { code });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.facts).toEqual({ brand: 'Test brand', packaging: { text: '400 g', amount: 400, unit: 'g', netQuantity: 400, netUnit: 'g' } });
    // Saved with the current version, so the next scan is served from the cache.
    expect((await owner.action(api.barcodes.lookup, { code })).facts).toEqual(result.facts);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
