/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';
import schema from './schema';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { hashCommunityToken } from './hub';
import type { Cook, Detail, Listing, Me, OwnListing, Report } from '../src/lib/community-contract';
const modules = import.meta.glob('./**/*.ts');

const base = { version: 1 as const, title: 'Tomato pasta', tags: ['Quick'], ingredients: [{ name: 'Pasta' }], steps: [{ text: 'Cook.' }] };
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
type Cooked = { id: Id<'users'>; token: string };
const key = (n: number) => n.toString(16).padStart(64, '0');

function setup() {
  const t = convexTest(schema, modules);
  const cook = async (name: string, { moderator = false } = {}): Promise<Cooked> => {
    const token = `token-${name}`;
    const hash = await hashCommunityToken(token);
    const id = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name });
      await ctx.db.insert('hubTokens', { userId, hash, expires: Date.now() + 90 * 86_400_000 });
      return userId;
    });
    if (moderator) await t.mutation(internal.moderation.setModerator, { userId: id, moderator: true });
    return { id, token };
  };
  const headers = (token?: string, address?: string) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(address ? { 'cf-connecting-ip': address } : {}) });
  const get = (path: string, token?: string) => t.fetch(path, { headers: headers(token) });
  const post = (path: string, body: unknown, token?: string, address?: string) => t.fetch(path, { method: 'POST', headers: headers(token, address), body: JSON.stringify(body) });
  const getJson = async <T>(path: string, token?: string) => {
    const response = await get(path, token);
    expect(response.status, path).toBe(200);
    return (await response.json()) as T;
  };
  const postJson = async <T>(path: string, body: unknown, token?: string, address?: string) => {
    const response = await post(path, body, token, address);
    expect(response.status, path).toBe(200);
    return (await response.json()) as T;
  };
  const resetLimits = () => t.run(async (ctx) => { for (const row of await ctx.db.query('authRateLimitEvents').collect()) await ctx.db.delete(row._id); });
  const publish = async (author: Cooked, overrides: Partial<typeof base> & { photoDataUrl?: string } = {}, id?: string) => {
    await resetLimits();
    return (await postJson<{ id: Id<'hubRecipes'> }>('/api/v1/publish', { id, snapshot: { ...base, ...overrides }, visibility: 'public' }, author.token)).id;
  };
  const titles = async (query = '') => (await getJson<{ recipes: Listing[] }>(`/api/v2/recipes${query}`)).recipes.map((recipe) => recipe.title);
  const tagCounts = async () => (await getJson<{ tags: { tag: string; count: number }[] }>('/api/v2/tags')).tags;
  const reportRows = () => t.run((ctx) => ctx.db.query('hubReports').collect());
  const queue = async (moderator: Cooked, status?: string) => (await postJson<{ reports: Report[]; cursor: string | null }>('/api/v2/mod/reports', status ? { status } : {}, moderator.token)).reports;
  const resolve = (moderator: Cooked, reportId: string, action: string, reason?: string) => post('/api/v2/mod/resolve', { reportId, action, reason }, moderator.token);
  /** Three different people report a recipe. */
  const reportThrice = async (recipeId: string, start = 1) => {
    for (let n = start; n < start + 3; n++) await postJson('/api/v2/report', { recipeId, reason: 'spam', clientKey: key(n) });
  };
  /** Leaves a tip and returns its ID. */
  const tip = async (author: Cooked, recipeId: string, text = 'Rude tip', rating = 1) => {
    await postJson('/api/v2/made', { id: recipeId, rating, tip: text }, author.token);
    return (await t.run((ctx) => ctx.db.query('hubMade').withIndex('by_recipeId_and_userId', (q) => q.eq('recipeId', recipeId as Id<'hubRecipes'>).eq('userId', author.id)).unique()))!._id;
  };
  return { t, cook, get, post, getJson, postJson, publish, titles, tagCounts, reportRows, queue, resolve, reportThrice, tip, resetLimits };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reporting', () => {
  test('one open report per reporter and target, with or without an account', async () => {
    const { cook, publish, postJson, reportRows, tip } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice);
    const other = await publish(alice, { title: 'Other' });
    const tipId = await tip(bob, id);
    const send = (body: object, token?: string, address?: string) => postJson('/api/v2/report', { recipeId: id, reason: 'spam', ...body }, token, address);

    expect(await send({ clientKey: key(1), note: ' Looks like an ad ' })).toEqual({ success: true });
    expect(await send({ clientKey: key(1), reason: 'other' })).toEqual({ success: true });
    expect(await reportRows()).toHaveLength(1);
    // The same install from another address is still the same reporter.
    await send({ clientKey: key(1) }, undefined, '198.51.100.7');
    expect(await reportRows()).toHaveLength(1);
    await send({ clientKey: key(2) });
    expect(await reportRows()).toHaveLength(2);

    // Without a client key the address identifies the reporter.
    await send({}, undefined, '203.0.113.1');
    await send({}, undefined, '203.0.113.1');
    await send({}, undefined, '203.0.113.2');
    expect(await reportRows()).toHaveLength(4);

    // With a token the account does, whatever the client key.
    await send({ clientKey: key(3) }, bob.token);
    await send({ clientKey: key(4) }, bob.token);
    expect(await reportRows()).toHaveLength(5);

    // Another recipe, or a tip on this one, is another target. (By now the
    // recipe is under review, which doesn't stop further reports.)
    await postJson('/api/v2/report', { recipeId: other, reason: 'spam', clientKey: key(1) });
    await send({ clientKey: key(1), tipId });
    await send({ clientKey: key(1), tipId });
    const rows = await reportRows();
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ status: 'open', reason: 'spam', note: 'Looks like an ad' });
    expect(rows[6].tipId).toBe(tipId);

    // Who reported is stored only as a hash.
    for (const row of rows) {
      expect(row.reporter).toMatch(/^[a-f0-9]{64}$/);
      expect(row.reporter).not.toBe(key(1));
    }
    expect(JSON.stringify(rows)).not.toContain(bob.id);
    expect(JSON.stringify(rows)).not.toContain('203.0.113');
  });

  test('validates its input and the target', async () => {
    const { cook, publish, post, tip } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice);
    const other = await publish(alice, { title: 'Other' });
    const otherTip = await tip(bob, other);
    const status = async (body: object, token?: string) => (await post('/api/v2/report', body, token)).status;
    expect(await status({ recipeId: id, reason: 'boring' })).toBe(400);
    expect(await status({ recipeId: id })).toBe(400);
    expect(await status({ reason: 'spam' })).toBe(400);
    expect(await status({ recipeId: id, reason: 'spam', note: 'x'.repeat(501) })).toBe(400);
    expect(await status({ recipeId: id, reason: 'spam', note: 'x'.repeat(500) })).toBe(200);
    expect(await status({ recipeId: id, reason: 'spam', clientKey: 'device-42' })).toBe(400);
    expect(await status({ recipeId: 'missing', reason: 'spam' })).toBe(404);
    expect(await status({ recipeId: id, tipId: otherTip, reason: 'spam' })).toBe(404);
    expect(await status({ recipeId: id, tipId: 'missing', reason: 'spam' })).toBe(404);
    expect(await status({ recipeId: id, reason: 'spam' }, 'bad-token')).toBe(401);
    await post('/api/v1/unpublish', { id }, alice.token);
    expect(await status({ recipeId: id, reason: 'spam', clientKey: key(5) })).toBe(404);
  });

  test('reports are rate limited per address', async () => {
    const { cook, publish, post } = setup();
    const id = await publish(await cook('Alice'));
    const from = (address: string, n: number) => post('/api/v2/report', { recipeId: id, reason: 'other', clientKey: key(n) }, undefined, address);
    for (let n = 0; n < 30; n++) expect((await from('203.0.113.9', n)).status).toBe(200);
    expect((await from('203.0.113.9', 100)).status).toBe(429);
    expect((await from('203.0.113.10', 101)).status).toBe(200);
  });

  test('three reporters hide a recipe everywhere until a moderator dismisses the reports', async () => {
    const { cook, publish, get, post, getJson, postJson, titles, tagCounts, queue, resolve, reportRows } = setup();
    const [alice, bob, mod] = [await cook('Alice'), await cook('Bob'), await cook('Mod', { moderator: true })];
    const id = await publish(alice, { title: 'Reported', tags: ['Dinner'] });
    await publish(alice, { title: 'Fine', tags: ['Lunch'] });
    await postJson('/api/v2/follow', { userId: alice.id, following: true }, bob.token);
    // Each reporter is at its own address: anonymous reports from one address count once.
    const report = (n: number) => postJson('/api/v2/report', { recipeId: id, reason: 'offensive', clientKey: key(n) }, undefined, `203.0.113.${n}`);

    await report(1);
    await report(2);
    await report(2);
    expect(await titles()).toEqual(['Fine', 'Reported']);
    expect((await postJson<{ recipes: OwnListing[] }>('/api/v2/me/recipes', {}, alice.token)).recipes.map((recipe) => recipe.underReview)).toEqual([false, false]);
    await report(3);

    expect(await titles()).toEqual(['Fine']);
    expect(await titles('?sort=hot')).toEqual(['Fine']);
    expect(await titles('?sort=top')).toEqual(['Fine']);
    expect(await titles('?search=reported')).toEqual([]);
    // Only a moderator can still open it, to judge the reports.
    expect((await get(`/api/v2/recipes/${id}`, bob.token)).status).toBe(404);
    expect((await get(`/api/v2/recipes/${id}`, mod.token)).status).toBe(200);
    expect(await titles('?tag=dinner')).toEqual([]);
    expect(await titles(`?author=${alice.id}`)).toEqual(['Fine']);
    expect((await postJson<{ recipes: Listing[] }>('/api/v2/feed/following', {}, bob.token)).recipes.map((recipe) => recipe.title)).toEqual(['Fine']);
    expect((await getJson<{ recipes: { id: string }[] }>('/api/v1/recipes')).recipes.map((recipe) => recipe.id)).not.toContain(id);
    expect((await getJson<{ recipes: unknown[] }>('/api/v1/recipes?search=reported')).recipes).toEqual([]);
    expect((await get(`/api/v2/recipes/${id}`)).status).toBe(404);
    expect((await get(`/api/v2/recipes/${id}`, alice.token)).status).toBe(404);
    expect((await get(`/api/v2/recipes/${id}/tips`)).status).toBe(404);
    expect((await get(`/api/v1/recipes/${id}`)).status).toBe(404);
    expect(await getJson(`/api/v2/revisions?ids=${id}`)).toEqual({ revisions: { [id]: null } });
    expect(await tagCounts()).toEqual([{ tag: 'lunch', count: 1 }]);
    expect((await getJson<Cook>(`/api/v2/cooks/${alice.id}`)).recipeCount).toBe(1);
    expect((await post('/api/v2/like', { id, liked: true }, bob.token)).status).toBe(404);
    expect((await post('/api/v2/save', { id, clientKey: key(8) })).status).toBe(404);
    const mine = (await postJson<{ recipes: OwnListing[] }>('/api/v2/me/recipes', {}, alice.token)).recipes;
    expect(mine.map((recipe) => [recipe.title, recipe.visibility, recipe.underReview, recipe.removed])).toEqual([['Fine', 'public', false, false], ['Reported', 'public', true, false]]);

    // Republishing doesn't lift the review.
    await publish(alice, { title: 'Reported, edited', tags: ['Dinner'] }, id);
    expect(await titles()).toEqual(['Fine']);
    expect((await get(`/api/v2/recipes/${id}`)).status).toBe(404);
    expect(await tagCounts()).toEqual([{ tag: 'lunch', count: 1 }]);

    const open = await queue(mod);
    expect(open).toHaveLength(3);
    expect(open[0]).toEqual({
      id: expect.any(String), status: 'open', createdAt: expect.any(String), reason: 'offensive', reportCount: 3,
      recipe: { id, title: 'Reported, edited', author: { id: alice.id, name: 'Alice' }, visibility: 'public', underReview: true },
    });
    expect((await resolve(mod, open[2].id, 'dismiss', 'Looks fine')).status).toBe(200);

    expect(await titles()).toEqual(['Fine', 'Reported, edited']);
    expect((await getJson<Detail>(`/api/v2/recipes/${id}`)).title).toBe('Reported, edited');
    expect(await getJson(`/api/v2/revisions?ids=${id}`)).toEqual({ revisions: { [id]: 2 } });
    expect((await tagCounts()).map((row) => row.tag).sort()).toEqual(['dinner', 'lunch']);
    expect((await getJson<Cook>(`/api/v2/cooks/${alice.id}`)).recipeCount).toBe(2);
    expect(await queue(mod)).toEqual([]);
    const dismissed = await queue(mod, 'dismissed');
    expect(dismissed).toHaveLength(3);
    expect(dismissed[0]).toMatchObject({ status: 'dismissed', resolution: 'Dismissed: Looks fine', resolvedAt: expect.any(String), reportCount: 0, recipe: { underReview: false } });
    expect((await reportRows()).every((row) => row.resolvedBy === mod.id)).toBe(true);

    // The reporters a moderator overruled can report again but no longer count; three others hide it again.
    await report(1);
    await report(2);
    await report(3);
    await report(4);
    await report(5);
    expect(await titles()).toEqual(['Fine', 'Reported, edited']);
    await report(6);
    expect(await titles()).toEqual(['Fine']);
  });

  test('reports about a tip never hide the recipe', async () => {
    const { cook, publish, postJson, titles, tip } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice);
    const tipId = await tip(bob, id);
    for (let n = 1; n <= 4; n++) await postJson('/api/v2/report', { recipeId: id, tipId, reason: 'harassment', clientKey: key(n) });
    await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(1) });
    await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(2) });
    expect(await titles()).toEqual(['Tomato pasta']);
  });

  test('a new report is emailed to the moderation address when email is configured', async () => {
    vi.useFakeTimers();
    vi.stubEnv('RESEND_API_KEY', 're_test_dummy');
    vi.stubEnv('SMTP_FROM', 'Sous Chef <no-reply@example.com>');
    vi.stubEnv('MODERATION_EMAIL', 'mods@example.com');
    vi.stubEnv('SHARE_URL_BASE', 'https://example.com/r');
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { t, cook, publish, postJson, reportRows } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice, { title: 'Dubious stew' });

    await postJson('/api/v2/report', { recipeId: id, reason: 'dangerous', note: 'Raw chicken', clientKey: key(1) }, bob.token);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_dummy');
    const email = JSON.parse(String(init.body)) as { from: string; to: string; subject: string; text: string };
    expect(email).toMatchObject({ from: 'Sous Chef <no-reply@example.com>', to: 'mods@example.com', subject: 'Community report: Dubious stew' });
    expect(email.text).toContain('Dangerous or unsafe food advice');
    expect(email.text).toContain('Raw chicken');
    expect(email.text).toContain(`Recipe ID: ${id}`);
    expect(email.text).toContain(`https://example.com/r/${id}`);
    // The reporter stays anonymous, also in the email.
    expect(email.text).not.toContain(bob.id);
    expect(email.text).not.toContain('Bob');

    // A repeat of the same report sends nothing; a failing provider doesn't fail the report.
    await postJson('/api/v2/report', { recipeId: id, reason: 'dangerous', clientKey: key(1) }, bob.token);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    expect(await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(2) })).toEqual({ success: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    expect(await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(3) })).toEqual({ success: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await reportRows()).toHaveLength(3);
  });

  test('unpublishing takes the photo down, and out-of-range numbers are never served', async () => {
    const { t, cook, publish, postJson, getJson } = setup();
    const alice = await cook('Alice');
    const id = await publish(alice, { title: 'Huge', servings: 1e100, totalTimeMinutes: -5, ingredients: [{ name: 'Rice', quantity: 1e300 }, { name: 'Beans', quantity: 2 }], photoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' } as never);
    const detail = await getJson<Detail>(`/api/v2/recipes/${id}`);
    expect(detail.servings).toBeUndefined();
    expect(detail.snapshot.servings).toBeUndefined();
    expect(detail.snapshot.totalTimeMinutes).toBeUndefined();
    expect(detail.snapshot.ingredients).toEqual([{ name: 'Rice' }, { name: 'Beans', quantity: 2 }]);
    const v1 = await getJson<{ snapshot: Detail['snapshot'] }>(`/api/v1/recipes/${id}`);
    expect(v1.snapshot.servings).toBeUndefined();
    const before = await t.run((ctx) => ctx.db.system.query('_storage').collect());
    expect(before).toHaveLength(1);
    await postJson('/api/v1/unpublish', { id }, alice.token);
    expect(await t.run((ctx) => ctx.db.system.query('_storage').collect())).toHaveLength(0);
  });

  test('one address cannot hide a recipe with made-up client keys, but signed-in cooks each count', async () => {
    const { cook, publish, postJson, titles } = setup();
    const [alice, bob, cara] = [await cook('Alice'), await cook('Bob'), await cook('Cara')];
    const id = await publish(alice, { title: 'Targeted' });
    for (const n of [1, 2, 3, 4, 5]) await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(n) }, undefined, '198.51.100.7');
    expect(await titles()).toEqual(['Targeted']);
    for (const reporter of [bob, cara]) await postJson('/api/v2/report', { recipeId: id, reason: 'spam' }, reporter.token, '198.51.100.7');
    expect(await titles()).toEqual([]);
  });

  test('without all three email settings nothing is sent or scheduled', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_dummy');
    vi.stubEnv('SMTP_FROM', 'Sous Chef <no-reply@example.com>');
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const { t, cook, publish, postJson } = setup();
    const id = await publish(await cook('Alice'));
    await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(1) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect())).toEqual([]);
  });
});

describe('moderators', () => {
  test('only moderators reach the queue, and the role is granted from the CLI', async () => {
    const { t, cook, publish, post, postJson, queue } = setup();
    const [alice, bob] = [await cook('Alice'), await cook('Bob')];
    const id = await publish(alice);
    await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(1) });
    const reportId = (await t.run((ctx) => ctx.db.query('hubReports').first()))!._id;

    expect((await post('/api/v2/mod/reports', {})).status).toBe(401);
    expect((await post('/api/v2/mod/resolve', { reportId, action: 'dismiss' })).status).toBe(401);
    for (const body of [{}, { status: 'actioned' }]) {
      const refused = await post('/api/v2/mod/reports', body, bob.token);
      expect(refused.status).toBe(403);
      expect(JSON.stringify(await refused.json())).not.toContain(id);
    }
    expect((await post('/api/v2/mod/resolve', { reportId, action: 'remove_recipe' }, bob.token)).status).toBe(403);
    expect((await post('/api/v2/mod/resolve', { reportId, action: 'ban_user' }, alice.token)).status).toBe(403);
    expect((await postJson<Me>('/api/v2/me', {}, bob.token)).moderator).toBe(false);
    expect(await t.run((ctx) => ctx.db.get(reportId))).toMatchObject({ status: 'open' });

    expect(await t.mutation(internal.moderation.setModerator, { userId: bob.id, moderator: true })).toEqual({ moderator: true });
    await t.mutation(internal.moderation.setModerator, { userId: bob.id, moderator: true });
    expect(await t.query(internal.moderation.moderators, {})).toEqual([{ userId: bob.id, name: 'Bob' }]);
    expect((await postJson<Me>('/api/v2/me', {}, bob.token)).moderator).toBe(true);
    const reports = await queue(bob);
    expect(reports).toHaveLength(1);
    // The queue never says who reported.
    expect(Object.keys(reports[0]).sort()).toEqual(['createdAt', 'id', 'reason', 'recipe', 'reportCount', 'status']);

    expect((await post('/api/v2/mod/reports', { status: 'closed' }, bob.token)).status).toBe(400);
    expect((await post('/api/v2/mod/resolve', { reportId, action: 'delete_everything' }, bob.token)).status).toBe(400);
    expect((await post('/api/v2/mod/resolve', { reportId: 'missing', action: 'dismiss' }, bob.token)).status).toBe(404);
    expect((await post('/api/v2/mod/resolve', { reportId, action: 'remove_tip' }, bob.token)).status).toBe(400);

    await t.mutation(internal.moderation.setModerator, { userId: bob.id, moderator: false });
    expect((await post('/api/v2/mod/reports', {}, bob.token)).status).toBe(403);
    await expect(t.mutation(internal.moderation.setModerator, { userId: id as unknown as Id<'users'>, moderator: true })).rejects.toThrow();
  });

  test('remove_recipe hides the recipe for good and closes its reports', async () => {
    const { t, cook, publish, get, post, postJson, titles, tagCounts, queue, resolve, reportThrice, tip } = setup();
    const [alice, bob, mod] = [await cook('Alice'), await cook('Bob'), await cook('Mod', { moderator: true })];
    const id = await publish(alice, { title: 'Spam', photoDataUrl: PHOTO });
    expect(await t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)).toBe(1);
    const tipId = await tip(bob, id);
    await postJson('/api/v2/report', { recipeId: id, tipId, reason: 'other', clientKey: key(9) });
    await reportThrice(id);
    const recipeReport = (await queue(mod)).find((report) => !report.tip)!;
    expect(recipeReport.reportCount).toBe(3);

    expect(await (await resolve(mod, recipeReport.id, 'remove_recipe', 'Advertising')).json()).toEqual({ success: true });
    expect(await titles()).toEqual([]);
    expect(await tagCounts()).toEqual([]);
    expect((await get(`/api/v2/recipes/${id}`)).status).toBe(404);
    const mine = (await postJson<{ recipes: OwnListing[] }>('/api/v2/me/recipes', {}, alice.token)).recipes;
    expect(mine[0]).toMatchObject({ visibility: 'private', removed: true, underReview: false });
    // The photo is deleted with the recipe, so its link stops working.
    expect(mine[0]).not.toHaveProperty('photoUrl');
    expect(await t.run(async (ctx) => (await ctx.db.system.query('_storage').collect()).length)).toBe(0);
    expect((await post('/api/v1/publish', { id, snapshot: base, visibility: 'public' }, alice.token)).status).toBe(400);
    expect(await titles()).toEqual([]);

    // Every open report on the recipe is closed; the tip report is its own target.
    const actioned = await queue(mod, 'actioned');
    expect(actioned).toHaveLength(3);
    expect(actioned.every((report) => report.resolution === 'Recipe removed: Advertising' && report.recipe?.visibility === 'private')).toBe(true);
    const open = await queue(mod);
    expect(open).toHaveLength(1);
    expect(open[0].tip).toEqual({ id: tipId, author: { id: bob.id, name: 'Bob' }, rating: 1, tip: 'Rude tip' });
    expect((await resolve(mod, recipeReport.id, 'dismiss')).status).toBe(400);
  });

  test('remove_tip hides the tip and takes its rating out of the counters', async () => {
    const { cook, publish, post, getJson, postJson, queue, resolve, tip } = setup();
    const [alice, bob, carol, mod] = [await cook('Alice'), await cook('Bob'), await cook('Carol'), await cook('Mod', { moderator: true })];
    const id = await publish(alice);
    const tipId = await tip(bob, id, 'Rude tip', 1);
    await tip(carol, id, 'Lovely', 5);
    expect(await getJson<Detail>(`/api/v2/recipes/${id}`)).toMatchObject({ madeCount: 2, rating: 3 });
    await postJson('/api/v2/report', { recipeId: id, tipId, reason: 'harassment', clientKey: key(1) });
    await postJson('/api/v2/report', { recipeId: id, tipId, reason: 'offensive', clientKey: key(2) });
    await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(3) });

    const tipReport = (await queue(mod)).find((report) => report.tip)!;
    expect(tipReport.reportCount).toBe(2);
    expect((await resolve(mod, tipReport.id, 'remove_tip')).status).toBe(200);
    const detail = await getJson<Detail>(`/api/v2/recipes/${id}`, bob.token);
    expect(detail).toMatchObject({ madeCount: 1, rating: 5 });
    expect(detail.tips.map((entry) => entry.tip)).toEqual(['Lovely']);
    expect(detail.viewer).not.toHaveProperty('made');
    expect((await getJson<{ tips: unknown[] }>(`/api/v2/recipes/${id}/tips`)).tips).toHaveLength(1);
    expect((await queue(mod, 'actioned')).map((report) => report.resolution)).toEqual(['Tip removed', 'Tip removed']);
    expect((await queue(mod)).map((report) => report.reason)).toEqual(['spam']);
    // A hidden tip can't be reported again, and removing the entry later doesn't double count.
    expect((await post('/api/v2/report', { recipeId: id, tipId, reason: 'spam' })).status).toBe(404);
    expect(await postJson('/api/v2/made/delete', { id }, bob.token)).toEqual({ madeCount: 1, rating: 5 });
    // Sending a new entry counts again.
    expect(await postJson('/api/v2/made', { id, rating: 3, tip: 'Sorry, it was fine' }, bob.token)).toEqual({ madeCount: 2, rating: 4 });
  });

  test('ban_user bans the author of what was reported', async () => {
    const { t, cook, publish, get, post, postJson, getJson, titles, queue, resolve, tip } = setup();
    const [alice, mallory, troll, mod] = [await cook('Alice'), await cook('Mallory'), await cook('Troll'), await cook('Mod', { moderator: true })];
    const alices = await publish(alice, { title: "Alice's" });
    const bad = await publish(mallory, { title: 'Bad one' });
    await publish(mallory, { title: 'Bad two' });
    const tipId = await tip(troll, alices, 'Nasty', 1);
    await postJson('/api/v2/report', { recipeId: bad, reason: 'harassment', clientKey: key(1) });
    await postJson('/api/v2/report', { recipeId: alices, tipId, reason: 'harassment', clientKey: key(1) });

    const reports = await queue(mod);
    expect((await resolve(mod, reports.find((report) => !report.tip)!.id, 'ban_user', 'Repeated harassment')).status).toBe(200);
    expect(await titles()).toEqual(["Alice's"]);
    expect((await post('/api/v2/me', {}, mallory.token)).status).toBe(401);
    expect((await get(`/api/v2/cooks/${mallory.id}`)).status).toBe(404);
    expect(await t.run((ctx) => ctx.db.query('hubBans').collect())).toEqual([expect.objectContaining({ userId: mallory.id, reason: 'Repeated harassment' })]);
    expect((await t.query(internal.moderation.recipe, { id: bad }))).toMatchObject({ removalReason: 'Author banned: Repeated harassment', author: { banned: true } });

    // A tip report bans the tip's author, not the recipe's.
    expect((await resolve(mod, reports.find((report) => report.tip)!.id, 'ban_user')).status).toBe(200);
    expect((await post('/api/v2/me', {}, troll.token)).status).toBe(401);
    expect((await post('/api/v2/me', {}, alice.token)).status).toBe(200);
    expect(await getJson<Detail>(`/api/v2/recipes/${alices}`)).toMatchObject({ madeCount: 0, tips: [] });
    expect((await queue(mod, 'actioned')).map((report) => report.resolution).sort()).toEqual(['Author banned', 'Author banned: Repeated harassment']);
    expect(await queue(mod)).toEqual([]);
  });

  test("a moderator can't ban themselves, and a banned moderator loses access", async () => {
    const { t, cook, publish, post, postJson, queue, resolve } = setup();
    const mod = await cook('Mod', { moderator: true });
    const id = await publish(mod);
    await postJson('/api/v2/report', { recipeId: id, reason: 'spam', clientKey: key(1) });
    const [report] = await queue(mod);
    expect((await resolve(mod, report.id, 'ban_user')).status).toBe(400);
    await t.mutation(internal.moderation.banUser, { userId: mod.id, reason: 'Abuse of role' });
    expect((await post('/api/v2/mod/reports', {}, mod.token)).status).toBe(401);
    expect(await t.query(internal.moderation.moderators, {})).toEqual([]);
  });

  test('the queue pages with a cursor', async () => {
    const { cook, publish, postJson, resetLimits } = setup();
    const [alice, mod] = [await cook('Alice'), await cook('Mod', { moderator: true })];
    const id = await publish(alice);
    for (let n = 0; n < 35; n++) {
      await resetLimits();
      await postJson('/api/v2/report', { recipeId: id, reason: 'other', clientKey: key(n + 1) });
    }
    const first = await postJson<{ reports: Report[]; cursor: string | null }>('/api/v2/mod/reports', {}, mod.token);
    expect(first.reports).toHaveLength(30);
    expect(first.reports[0].reportCount).toBe(35);
    const rest = await postJson<{ reports: Report[]; cursor: string | null }>('/api/v2/mod/reports', { cursor: first.cursor }, mod.token);
    expect(rest.reports).toHaveLength(5);
    expect(rest.cursor).toBeNull();
    expect(new Set([...first.reports, ...rest.reports].map((report) => report.id)).size).toBe(35);
  });
});

describe('moderation commands', () => {
  test('removing and restoring a recipe keeps tags and counts in step', async () => {
    const { t, cook, publish, titles, tagCounts, getJson, reportThrice } = setup();
    const alice = await cook('Alice');
    const id = await publish(alice, { tags: ['Dinner'] });
    await reportThrice(id);
    await t.mutation(internal.moderation.removeRecipe, { id, reason: 'Spam' });
    expect(await titles()).toEqual([]);
    expect(await tagCounts()).toEqual([]);
    expect((await getJson<Cook>(`/api/v2/cooks/${alice.id}`)).recipeCount).toBe(0);
    expect(await t.query(internal.moderation.recipe, { id })).toMatchObject({ removalReason: 'Spam', underReview: false });

    await t.mutation(internal.moderation.restoreRecipe, { id });
    expect(await titles()).toEqual([]);
    await publish(alice, { tags: ['Dinner', 'Easy'] }, id);
    expect(await titles()).toEqual(['Tomato pasta']);
    expect((await tagCounts()).map((row) => row.tag).sort()).toEqual(['dinner', 'easy']);
    expect((await getJson<Cook>(`/api/v2/cooks/${alice.id}`)).recipeCount).toBe(1);
  });

  test('banning a cook with many recipes finishes in the background', async () => {
    vi.useFakeTimers();
    const { t, cook, titles, tagCounts, resetLimits } = setup();
    const mallory = await cook('Mallory');
    for (let n = 0; n < 130; n++) {
      await resetLimits();
      await t.mutation(internal.hub.publish, { userId: mallory.id, snapshot: { ...base, title: `Spam ${n}`, tags: ['Spam', `tag${n % 7}`] }, visibility: 'public' });
    }
    expect((await tagCounts())[0]).toEqual({ tag: 'spam', count: 130 });
    expect(await t.mutation(internal.moderation.banUser, { userId: mallory.id, reason: 'Spam' })).toEqual({ recipesRemoved: 100 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await titles('?limit=50')).toEqual([]);
    expect(await tagCounts()).toEqual([]);
    const state = await t.run(async (ctx) => ({
      removed: (await ctx.db.query('hubRecipes').collect()).filter((recipe) => recipe.removedAt && recipe.visibility === 'private').length,
      tagRows: (await ctx.db.query('hubRecipeTags').collect()).length,
      recipeCount: (await ctx.db.query('hubProfiles').withIndex('by_userId', (q) => q.eq('userId', mallory.id)).unique())?.recipeCount,
    }));
    expect(state).toEqual({ removed: 130, tagRows: 0, recipeCount: 0 });
  });
});
