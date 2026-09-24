import { v } from 'convex/values';
import { action, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId, resolveHouseholdId } from './helpers';
import { checkAndRecordRateLimit } from './rateLimit';
import { fetchPublicHtml, PublicFetchError } from './lib/publicFetch';
import { recipeFromHtml, type RecipeImport } from '../../lib/recipe-import';

export const prepare = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId);
    if (!householdId) throw new Error('Create a kitchen first.');
    const allowed = await checkAndRecordRateLimit(ctx, { scope: 'recipe-import', subject: householdId, windowMs: 60000, max: 10 });
    if (!allowed) throw new Error('Your kitchen has imported several recipes. Wait a minute before trying again.');
    return null;
  },
});

/** Reads a public recipe page into an unsaved draft. Nothing is stored. */
export const fromUrl = action({
  args: { url: v.string() },
  handler: async (ctx, args): Promise<RecipeImport> => {
    if (args.url.length > 2000) throw new Error('That link is too long.');
    await ctx.runMutation(internal.recipeImport.prepare, {});
    try {
      const page = await fetchPublicHtml(args.url);
      return recipeFromHtml(page.html, page.url);
    } catch (error) {
      if (error instanceof PublicFetchError || error instanceof Error && error.message.startsWith('Could not find a recipe')) throw error;
      throw new Error('Could not import that recipe. Copy the recipe text and paste it instead.');
    }
  },
});
