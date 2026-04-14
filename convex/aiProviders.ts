import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId, getCurrentHouseholdId } from "./helpers";

const DEFAULT_PROVIDERS = [
  { providerId: "openai", providerName: "OpenAI", recommendedModel: "gpt-4" },
  {
    providerId: "anthropic",
    providerName: "Anthropic",
    recommendedModel: "claude-3.5-sonnet",
  },
  {
    providerId: "google",
    providerName: "Google AI",
    recommendedModel: "gemini-pro",
  },
];

export const list = query({
  args: { householdId: v.optional(v.id("households")) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = args.householdId ?? (await getCurrentHouseholdId(ctx, userId));
    if (!householdId) {
      return {
        keyMode: "bring-your-own" as const,
        providers: DEFAULT_PROVIDERS.map((p) => ({
          id: p.providerId,
          name: p.providerName,
          recommendedModel: p.recommendedModel,
          availableByok: true,
          status: "needs-key",
        })),
        activeProviderId: undefined,
      };
    }

    const settings = await ctx.db
      .query("aiProviderSettings")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();

    const settingsMap = new Map(settings.map((s) => [s.providerId, s]));
    const activeProvider = settings.find((s) => s.isActive);

    const providers = DEFAULT_PROVIDERS.map((p) => {
      const setting = settingsMap.get(p.providerId);
      return {
        id: p.providerId,
        name: p.providerName,
        recommendedModel: p.recommendedModel,
        availableByok: true,
        status: setting?.status ?? "needs-key",
      };
    });

    return {
      keyMode: "bring-your-own" as const,
      providers,
      activeProviderId: activeProvider?.providerId,
    };
  },
});

export const configure = mutation({
  args: {
    providerId: v.string(),
    apiKey: v.optional(v.string()),
    model: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);
    if (!householdId) throw new Error("No household");

    const existing = await ctx.db
      .query("aiProviderSettings")
      .withIndex("by_householdId_and_providerId", (q) =>
        q.eq("householdId", householdId).eq("providerId", args.providerId),
      )
      .unique();

    const providerInfo = DEFAULT_PROVIDERS.find(
      (p) => p.providerId === args.providerId,
    );

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (args.apiKey !== undefined) {
        patch.apiKey = args.apiKey;
        patch.status = args.apiKey ? "ready" : "needs-key";
      }
      if (args.model !== undefined) patch.model = args.model;
      if (args.isActive !== undefined) {
        patch.isActive = args.isActive;
        // Deactivate others if activating this one
        if (args.isActive) {
          const others = await ctx.db
            .query("aiProviderSettings")
            .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
            .collect();
          for (const other of others) {
            if (other._id !== existing._id && other.isActive) {
              await ctx.db.patch(other._id, { isActive: false });
            }
          }
        }
      }
      await ctx.db.patch(existing._id, patch);
    } else {
      // Deactivate others if activating
      if (args.isActive) {
        const others = await ctx.db
          .query("aiProviderSettings")
          .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
          .collect();
        for (const other of others) {
          if (other.isActive) {
            await ctx.db.patch(other._id, { isActive: false });
          }
        }
      }

      await ctx.db.insert("aiProviderSettings", {
        householdId,
        providerId: args.providerId,
        providerName: providerInfo?.providerName ?? args.providerId,
        apiKey: args.apiKey,
        model: args.model,
        status: args.apiKey ? "ready" : "needs-key",
        isActive: args.isActive ?? false,
      });
    }

    return { success: true };
  },
});

export const remove = mutation({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);
    if (!householdId) throw new Error("No household");

    const setting = await ctx.db
      .query("aiProviderSettings")
      .withIndex("by_householdId_and_providerId", (q) =>
        q.eq("householdId", householdId).eq("providerId", args.providerId),
      )
      .unique();
    if (setting) {
      await ctx.db.delete(setting._id);
    }
    return { success: true };
  },
});
