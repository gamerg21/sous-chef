/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import schema from './schema';
import { api, internal } from './_generated/api';
const modules = import.meta.glob('./**/*.ts');
const snapshot = { version: 1 as const, title: 'Tomato pasta', tags: ['quick'], ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }], steps: [{ text: 'Cook.' }] };

test('removed recipes disappear and cannot be republished by their author', async () => {
  const t = convexTest(schema, modules);
  const alice = await t.run((ctx) => ctx.db.insert('users', { name: 'Alice' }));
  const { id } = await t.mutation(internal.hub.publish, { userId: alice, snapshot, visibility: 'public' });
  await t.mutation(internal.moderation.removeRecipe, { id, reason: 'Spam' });
  expect((await t.query(api.hub.list, {})).recipes).toHaveLength(0);
  expect(await t.query(api.hub.get, { id })).toBeNull();
  expect((await t.query(internal.moderation.recipe, { id }))?.removalReason).toBe('Spam');
  await expect(t.mutation(internal.hub.publish, { userId: alice, id, snapshot, visibility: 'public' })).rejects.toThrow('removed by a moderator');
  await t.mutation(internal.moderation.restoreRecipe, { id });
  await t.mutation(internal.hub.publish, { userId: alice, id, snapshot, visibility: 'public' });
  expect((await t.query(api.hub.list, {})).recipes).toHaveLength(1);
});

test('banning a cook removes their recipes, revokes tokens and blocks their Apple ID', async () => {
  const t = convexTest(schema, modules);
  const result = await t.mutation(internal.apple.signIn, { sub: 'apple-sub-1', fullName: 'Mallory', refreshToken: 'r1', tokenHash: 'hash-1' });
  const userId = result!.userId;
  await t.mutation(internal.hub.publish, { userId, snapshot, visibility: 'public' });
  expect(await t.query(internal.hub.identify, { hash: 'hash-1' })).toBe(userId);

  expect(await t.mutation(internal.moderation.banUser, { userId, reason: 'Harassment' })).toEqual({ recipesRemoved: 1 });
  expect((await t.query(api.hub.list, {})).recipes).toHaveLength(0);
  expect(await t.query(internal.hub.identify, { hash: 'hash-1' })).toBeNull();
  await expect(t.mutation(internal.hub.publish, { userId, snapshot, visibility: 'public' })).rejects.toThrow('suspended');
  await expect(t.mutation(internal.apple.signIn, { sub: 'apple-sub-1', refreshToken: 'r2', tokenHash: 'hash-2' })).rejects.toThrow('suspended');

  expect(await t.mutation(internal.moderation.unbanUser, { userId })).toBe(1);
  expect((await t.mutation(internal.apple.signIn, { sub: 'apple-sub-1', refreshToken: 'r3', tokenHash: 'hash-3' }))?.userId).toBe(userId);
});
