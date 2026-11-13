import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { authTables } from '@convex-dev/auth/server';
import { snapshotValidator } from '../src/lib/community-contract';

export const reportReasonValidator = v.union(
  v.literal('offensive'), v.literal('harassment'), v.literal('sexual'), v.literal('spam'),
  v.literal('dangerous'), v.literal('copyright'), v.literal('other'),
);
export const reportStatusValidator = v.union(v.literal('open'), v.literal('actioned'), v.literal('dismissed'));

// Community only. Private kitchens run in SQLite; existing auth keys/providers stay intact.
export default defineSchema({
  ...authTables,
  hubTokens:defineTable({userId:v.id('users'),hash:v.string(),expires:v.number()}).index('by_hash',['hash']).index('by_userId',['userId']),
  // Fields after `removalReason` arrived with API v2 and are optional because
  // older documents lack them until `migrations:run` has visited them.
  hubRecipes: defineTable({
    userId: v.id('users'),
    sourceKey: v.optional(v.string()),
    // Without `photoDataUrl` once the photo is in file storage (`photoId`).
    snapshot: snapshotValidator,
    revision: v.number(),
    visibility: v.union(v.literal('public'), v.literal('unlisted'), v.literal('private')),
    updatedAt: v.number(),
    searchText: v.string(),
    removedAt: v.optional(v.number()),
    removalReason: v.optional(v.string()),
    photoId: v.optional(v.id('_storage')),
    photoType: v.optional(v.string()),
    likeCount: v.optional(v.number()),
    saveCount: v.optional(v.number()),
    madeCount: v.optional(v.number()),
    ratingSum: v.optional(v.number()),
    hot: v.optional(v.number()),
    // True while enough open reports hide the recipe; otherwise absent, so
    // indexes can select listed recipes with `eq('underReview', undefined)`.
    underReview: v.optional(v.boolean()),
    // True while this recipe is included in its author's `recipeCount`.
    counted: v.optional(v.boolean()),
  })
    .index('by_userId', ['userId'])
    .index('by_userId_and_sourceKey', ['userId', 'sourceKey'])
    .index('by_visibility_and_underReview', ['visibility', 'underReview'])
    .index('by_visibility_and_underReview_and_hot', ['visibility', 'underReview', 'hot'])
    .index('by_visibility_and_underReview_and_likeCount', ['visibility', 'underReview', 'likeCount'])
    .index('by_userId_and_visibility_and_underReview', ['userId', 'visibility', 'underReview'])
    .index('by_userId_and_visibility_and_underReview_and_hot', ['userId', 'visibility', 'underReview', 'hot'])
    .index('by_userId_and_visibility_and_underReview_and_likeCount', ['userId', 'visibility', 'underReview', 'likeCount'])
    .searchIndex('search_recipes', { searchField: 'searchText', filterFields: ['visibility', 'underReview'] }),
  // One row per tag of each publicly listed recipe, carrying the sort keys.
  hubRecipeTags: defineTable({ tag: v.string(), recipeId: v.id('hubRecipes'), createdAt: v.number(), hot: v.number(), likeCount: v.number() })
    .index('by_recipeId', ['recipeId'])
    .index('by_tag_and_createdAt', ['tag', 'createdAt'])
    .index('by_tag_and_hot', ['tag', 'hot'])
    .index('by_tag_and_likeCount', ['tag', 'likeCount']),
  hubTagCounts: defineTable({ tag: v.string(), count: v.number() }).index('by_tag', ['tag']).index('by_count', ['count']),
  hubLikes: defineTable({ recipeId: v.id('hubRecipes'), userId: v.id('users') })
    .index('by_recipeId_and_userId', ['recipeId', 'userId'])
    .index('by_userId', ['userId']),
  // `clientKey` is a hash chosen by the saving install; it only prevents double counting.
  hubSaves: defineTable({ recipeId: v.id('hubRecipes'), clientKey: v.string() }).index('by_recipeId_and_clientKey', ['recipeId', 'clientKey']),
  // "I made it": one per cook and recipe. `tipVisible` is true only while the
  // entry has tip text and no moderator hid it.
  hubMade: defineTable({
    recipeId: v.id('hubRecipes'), userId: v.id('users'), rating: v.number(), tip: v.optional(v.string()),
    hidden: v.optional(v.boolean()), tipVisible: v.optional(v.boolean()), updatedAt: v.number(),
  })
    .index('by_recipeId_and_userId', ['recipeId', 'userId'])
    .index('by_userId', ['userId'])
    .index('by_recipeId_and_tipVisible_and_updatedAt', ['recipeId', 'tipVisible', 'updatedAt']),
  hubFollows: defineTable({ followerId: v.id('users'), followeeId: v.id('users') })
    .index('by_followerId_and_followeeId', ['followerId', 'followeeId'])
    .index('by_followeeId', ['followeeId']),
  hubProfiles: defineTable({ userId: v.id('users'), bio: v.optional(v.string()), followerCount: v.number(), followingCount: v.number(), recipeCount: v.number() })
    .index('by_userId', ['userId']),
  hubModerators: defineTable({ userId: v.id('users'), createdAt: v.number() }).index('by_userId', ['userId']),
  // `reporter` is a hash (of the user ID, the client key or the address), never an identity.
  hubReports: defineTable({
    recipeId: v.id('hubRecipes'), tipId: v.optional(v.id('hubMade')), reporter: v.string(),
    // Signed-in reporters count one each toward hiding a recipe; anonymous ones count once per address.
    reporterGroup: v.optional(v.string()),
    reason: reportReasonValidator, note: v.optional(v.string()), status: reportStatusValidator,
    resolution: v.optional(v.string()), resolvedAt: v.optional(v.number()), resolvedBy: v.optional(v.id('users')),
  })
    .index('by_status', ['status'])
    .index('by_recipeId_and_status', ['recipeId', 'status'])
    .index('by_reporter_and_recipeId_and_status', ['reporter', 'recipeId', 'status']),
  // Server-only: Apple refresh tokens, kept so account deletion can revoke them.
  // Moderator bans; an Apple sub keeps a banned cook from returning after deleting their account.
  hubBans:defineTable({userId:v.optional(v.id('users')),appleSub:v.optional(v.string()),reason:v.string(),createdAt:v.number()}).index('by_userId',['userId']).index('by_appleSub',['appleSub']),
  appleCredentials:defineTable({userId:v.id('users'),sub:v.string(),refreshToken:v.string(),createdAt:v.number()}).index('by_userId',['userId']).index('by_sub',['sub']),
  authRateLimitEvents:defineTable({scope:v.string(),subjectHash:v.string(),ipHash:v.string(),windowStart:v.number(),count:v.number()}).index('by_scope',['scope']).index('by_windowStart',['windowStart']).index('by_scope_and_subjectHash_and_ipHash_and_windowStart',['scope','subjectHash','ipHash','windowStart']),
});
