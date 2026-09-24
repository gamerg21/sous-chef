import { ConvexError, v } from 'convex/values';
import { action, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { getAuthUserId, resolveHouseholdId } from './helpers';
import { checkAndRecordRateLimit } from './rateLimit';
import { decryptSecret } from './secrets';
import { generateRecipeWithProvider, type AiRecipeDraft } from './lib/recipeAi';

type Context = { provider: string; model: string; apiKey: string; pantry: { name: string; quantity: number; unit: string }[]; householdId: Id<'households'> };
export const prepare = internalMutation({
  args: {},
  handler: async (ctx): Promise<Context> => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId);
    if (!householdId) throw new ConvexError('Create a kitchen first.');
    const settings = await ctx.db.query('aiProviderSettings').withIndex('by_householdId', q => q.eq('householdId', householdId)).take(10);
    const setting = settings.find(item => item.isActive);
    if (!setting?.apiKey || !setting.model?.trim()) throw new ConvexError('Choose a provider, API key, and model in Integrations first.');
    const stock = await ctx.db.query('inventoryItems').withIndex('by_householdId', q => q.eq('householdId', householdId)).take(101);
    if (!stock.length) throw new ConvexError('Add a few pantry items first.');
    if (stock.length > 100) throw new ConvexError('Pantry ideas currently supports kitchens with up to 100 inventory batches.');
    const allowed = await checkAndRecordRateLimit(ctx, { scope: 'recipe-ideas', subject: householdId, windowMs: 60000, max: 3 });
    if (!allowed) throw new ConvexError('Your kitchen has requested several drafts. Wait a minute before trying again.');
    const pantry = await Promise.all(stock.filter(item => item.quantity > 0).map(async item => ({ name: (await ctx.db.get(item.foodItemId))?.name.slice(0, 200) ?? 'Unknown', quantity: item.quantity, unit: item.unit.slice(0, 80) })));
    return { householdId, provider: setting.providerId, model: setting.model, apiKey: setting.apiKey, pantry };
  },
});

/** A one-shot structured draft, with no chat thread, auto-save, or automatic retry. */
export const generate = action({
  args: { preferences: v.string() },
  handler: async (ctx, args): Promise<{ draft: AiRecipeDraft; provider: string; model: string }> => {
    if (args.preferences.length > 1000) throw new ConvexError('Keep preferences under 1,000 characters.');
    const context: Context = await ctx.runMutation(internal.recipeIdeas.prepare, {});
    let apiKey: string;
    try { apiKey = await decryptSecret(context.apiKey); }
    catch { throw new ConvexError('The saved provider key cannot be opened. Reconfigure it in Integrations.'); }
    try {
      const draft = await generateRecipeWithProvider(context.provider, context.model, apiKey, context.pantry, args.preferences);
      return { draft, provider: context.provider, model: context.model };
    } catch (error) {
      throw new ConvexError(error instanceof Error ? error.message : 'Could not generate a recipe draft.');
    }
  },
});
