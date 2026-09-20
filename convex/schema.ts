import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import { snapshotValidator } from '../src/lib/community-contract';
// Community only. Private kitchens run in SQLite; existing auth keys/providers stay intact.
export default defineSchema({
  ...authTables,
  hubTokens:defineTable({userId:v.id('users'),hash:v.string(),expires:v.number()}).index('by_hash',['hash']).index('by_userId',['userId']),
  hubRecipes:defineTable({userId:v.id('users'),sourceKey:v.optional(v.string()),snapshot:snapshotValidator,revision:v.number(),visibility:v.union(v.literal('public'),v.literal('unlisted'),v.literal('private')),updatedAt:v.number(),searchText:v.string()}).index('by_visibility',['visibility']).index('by_userId',['userId']).index('by_userId_and_sourceKey',['userId','sourceKey']).searchIndex('search_recipes',{searchField:'searchText',filterFields:['visibility']}),
  authRateLimitEvents:defineTable({scope:v.string(),subjectHash:v.string(),ipHash:v.string(),windowStart:v.number(),count:v.number()}).index('by_scope',['scope']).index('by_windowStart',['windowStart']).index('by_scope_and_subjectHash_and_ipHash_and_windowStart',['scope','subjectHash','ipHash','windowStart']),
});
