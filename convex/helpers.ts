import { getAuthUserId as authenticatedUser } from '@convex-dev/auth/server';
import type { QueryCtx, MutationCtx } from './_generated/server';
export async function getAuthUserId(ctx:QueryCtx|MutationCtx) {
  const id=await authenticatedUser(ctx);if(!id || !await ctx.db.get(id))throw new Error('Not authenticated');return id;
}
