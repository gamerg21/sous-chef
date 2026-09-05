import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId, getCurrentHouseholdId, resolveHouseholdId } from "./helpers";
import { encryptSecret, decryptSecret } from "./secrets";

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
    const householdId = await resolveHouseholdId(ctx, userId, args.householdId);
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

/**
 * Public entry point. Runs as an action so the API key can be encrypted
 * with Web Crypto (unavailable in mutations) before it is stored.
 */
export const configure = action({
  args: {
    providerId: v.string(),
    apiKey: v.optional(v.string()),
    model: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const apiKey =
      args.apiKey !== undefined && args.apiKey !== ""
        ? await encryptSecret(args.apiKey)
        : args.apiKey;
    const result: { success: boolean } = await ctx.runMutation(
      internal.aiProviders.saveConfiguration,
      { ...args, apiKey },
    );
    return result;
  },
});

export const saveConfiguration = internalMutation({
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

export const getSettingWithKey = internalQuery({
  args: { providerId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);
    if (!householdId) return null;
    const setting = await ctx.db
      .query("aiProviderSettings")
      .withIndex("by_householdId_and_providerId", (q) =>
        q.eq("householdId", householdId).eq("providerId", args.providerId),
      )
      .unique();
    if (!setting) return null;
    return { apiKey: setting.apiKey ?? null, model: setting.model ?? null };
  },
});

export const recordTestResult = internalMutation({
  args: { providerId: v.string(), success: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await getCurrentHouseholdId(ctx, userId);
    if (!householdId) return null;
    const setting = await ctx.db
      .query("aiProviderSettings")
      .withIndex("by_householdId_and_providerId", (q) =>
        q.eq("householdId", householdId).eq("providerId", args.providerId),
      )
      .unique();
    if (setting) {
      await ctx.db.patch(setting._id, {
        status: args.success ? "ready" : "error",
        lastTestedAt: Date.now(),
      });
    }
    return null;
  },
});

/**
 * Verify the stored API key actually works by hitting the provider's
 * cheapest authenticated endpoint. Updates status and lastTestedAt.
 * (Replaces the removed /api/ai/providers/:id/test route.)
 */
export const test = action({
  args: { providerId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string }> => {
    const setting: { apiKey: string | null; model: string | null } | null =
      await ctx.runQuery(internal.aiProviders.getSettingWithKey, {
        providerId: args.providerId,
      });
    if (!setting?.apiKey) {
      return { success: false, error: "No API key configured" };
    }

    let apiKey: string;
    try {
      apiKey = await decryptSecret(setting.apiKey);
    } catch {
      return {
        success: false,
        error:
          "Stored key could not be decrypted — re-enter it (was SECRETS_ENCRYPTION_KEY changed?)",
      };
    }

    let request: { url: string; headers: Record<string, string> };
    switch (args.providerId) {
      case "openai":
        request = {
          url: "https://api.openai.com/v1/models",
          headers: { Authorization: `Bearer ${apiKey}` },
        };
        break;
      case "anthropic":
        request = {
          url: "https://api.anthropic.com/v1/models",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        };
        break;
      case "google":
        request = {
          url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
          headers: {},
        };
        break;
      default:
        return { success: false, error: `Unknown provider: ${args.providerId}` };
    }

    try {
      const response = await fetch(request.url, {
        headers: request.headers,
        signal: AbortSignal.timeout(10_000),
      });
      const success = response.ok;
      await ctx.runMutation(internal.aiProviders.recordTestResult, {
        providerId: args.providerId,
        success,
      });
      if (!success) {
        return {
          success: false,
          error:
            response.status === 401 || response.status === 403
              ? "The API key was rejected by the provider"
              : `Provider responded with status ${response.status}`,
        };
      }
      return { success: true };
    } catch (error) {
      await ctx.runMutation(internal.aiProviders.recordTestResult, {
        providerId: args.providerId,
        success: false,
      });
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Connection test failed",
      };
    }
  },
});
