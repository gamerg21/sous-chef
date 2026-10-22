import { v } from "convex/values";
import { action, query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId, resolveHouseholdId, getHouseholdMembership } from "./helpers";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { barcodeFactFields } from "./schema";
import { OFF_FIELDS, PRODUCT_FACTS_VERSION, inferCategory, parseProduct } from "../../lib/food-product";

export { inferCategory };

/**
 * Barcode lookup: local cache (barcodes table) first, then Open Food Facts,
 * with results persisted so repeat scans are instant and offline-tolerant.
 * Replaces the removed /api/barcode/lookup route.
 */

export type BarcodeLookupResult = {
  found: boolean;
  prefill: { name?: string; barcode?: string; category?: string };
  facts?: Record<string, unknown>;
  source?: "local_manual" | "open_food_facts";
  attribution?: { label: "Open Food Facts"; url: string; license: "ODbL" };
  stale?: boolean;
};

const FACT_KEYS = Object.keys(barcodeFactFields) as Array<keyof typeof barcodeFactFields>;

/** The product facts saved on a barcode record, as the inventory sees them. */
export function factsFromBarcode(barcode: Doc<"barcodes">): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  for (const key of FACT_KEYS) if (barcode[key] !== undefined) facts[key] = barcode[key];
  return facts;
}

export const getCached = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const barcode = await ctx.db
      .query("barcodes")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!barcode) return null;
    const foodItem = await ctx.db.get(barcode.foodItemId);
    return {
      name: foodItem?.name ?? undefined,
      code: barcode.code,
      source: barcode.source,
      manualLocked: barcode.manualLocked,
      lastSyncedAt: barcode.lastSyncedAt,
      factsVersion: barcode.factsVersion,
      attributionUrl: barcode.attributionUrl,
      categoriesTags: barcode.categoriesTags,
      facts: factsFromBarcode(barcode),
    };
  },
});

export const saveLookup = internalMutation({
  args: {
    code: v.string(),
    name: v.string(),
    attributionUrl: v.optional(v.string()),
    ...barcodeFactFields,
  },
  handler: async (ctx, args) => {
    let foodItem = await ctx.db
      .query("foodItems")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    const foodItemId =
      foodItem?._id ??
      (await ctx.db.insert("foodItems", {
        name: args.name,
        canonicalName: args.name.toLowerCase(),
      }));

    const { code, name: _name, ...facts } = args;
    const existing = await ctx.db
      .query("barcodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existing) {
      // Manual entries are locked against being overwritten by OFF syncs.
      if (!existing.manualLocked) {
        // Every fact is written, so ones the product no longer lists are cleared.
        const cleared = Object.fromEntries(FACT_KEYS.map((key) => [key, undefined]));
        await ctx.db.patch(existing._id, {
          foodItemId,
          ...cleared,
          ...facts,
          source: "OPEN_FOOD_FACTS",
          lastSyncedAt: Date.now(),
          factsVersion: PRODUCT_FACTS_VERSION,
        });
      }
      return existing._id;
    }
    return await ctx.db.insert("barcodes", {
      foodItemId,
      code,
      type: code.length === 13 ? "EAN13" : "UPC",
      source: "OPEN_FOOD_FACTS",
      manualLocked: false,
      ...facts,
      lastSyncedAt: Date.now(),
      factsVersion: PRODUCT_FACTS_VERSION,
    });
  },
});

const OFF_ATTRIBUTION = (url: string) =>
  ({ label: "Open Food Facts", url, license: "ODbL" }) as const;

export const settings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId);
    if (!householdId) throw new Error("No household found");
    const membership = await getHouseholdMembership(ctx, userId, householdId);
    const integration = await ctx.db.query("integrations")
      .withIndex("by_householdId_and_provider", q => q.eq("householdId", householdId).eq("provider", "open_food_facts")).first();
    const serverEnabled = (process.env.OPEN_FOOD_FACTS_ENABLED ?? "true").toLowerCase() !== "false";
    const enabled = integration ? integration.status === "connected" : true;
    return { enabled, serverEnabled, effectiveEnabled: enabled && serverEnabled,
      canManage: membership?.role === "owner" || membership?.role === "admin" };
  },
});

export const configure = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await resolveHouseholdId(ctx, userId);
    if (!householdId) throw new Error("No household found");
    const membership = await getHouseholdMembership(ctx, userId, householdId);
    if (membership?.role !== "owner" && membership?.role !== "admin") throw new Error("Only household owners and admins can change integrations");
    const existing = await ctx.db.query("integrations")
      .withIndex("by_householdId_and_provider", q => q.eq("householdId", householdId).eq("provider", "open_food_facts")).first();
    const status = enabled ? "connected" : "disconnected";
    if (existing) await ctx.db.patch(existing._id, { status });
    else await ctx.db.insert("integrations", { householdId, provider: "open_food_facts", name: "Open Food Facts",
      description: "Product information from barcodes", status });
    return { success: true };
  },
});

export const lookup = action({
  args: { code: v.string() },
  handler: async (ctx, args): Promise<BarcodeLookupResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const code = args.code.trim();
    if (!code) return { found: false, prefill: {} };
    if (!/^\d{8,14}$/.test(code)) throw new Error("Enter a barcode with 8–14 digits");
    const preferences = await ctx.runQuery(internal.barcodes.settings, {});

    const cached = await ctx.runQuery(internal.barcodes.getCached, { code });

    const ttlDays = Number(process.env.OPEN_FOOD_FACTS_CACHE_TTL_DAYS ?? 30);
    const fresh =
      cached &&
      (cached.manualLocked ||
        (cached.lastSyncedAt &&
          (cached.factsVersion ?? 1) >= PRODUCT_FACTS_VERSION &&
          Date.now() - cached.lastSyncedAt < ttlDays * 24 * 60 * 60 * 1000));

    const baseUrl =
      process.env.OPEN_FOOD_FACTS_API_BASE_URL ??
      "https://world.openfoodfacts.org";
    const productUrl = `${baseUrl}/product/${encodeURIComponent(code)}`;

    const cachedResult = (stale: boolean): BarcodeLookupResult => ({
      found: true,
      prefill: {
        name: cached!.name,
        barcode: code,
        category: inferCategory(cached!.categoriesTags),
      },
      facts: cached!.facts,
      source:
        cached!.source === "LOCAL_MANUAL" ? "local_manual" : "open_food_facts",
      attribution:
        cached!.source === "LOCAL_MANUAL"
          ? undefined
          : OFF_ATTRIBUTION(cached!.attributionUrl ?? productUrl),
      stale,
    });

    if (fresh) {
      return cachedResult(false);
    }

    if (!preferences.effectiveEnabled) {
      return cached ? cachedResult(true) : { found: false, prefill: { barcode: code } };
    }

    try {
      const { allowed } = await ctx.runMutation(internal.rateLimit.checkAndRecord, {
        scope: "open-food-facts", subject: "instance", windowMs: 60000, max: 15,
      });
      if (!allowed) throw new Error("Too many barcode lookups. Try again in a minute.");
      const timeoutMs = Number(process.env.OPEN_FOOD_FACTS_TIMEOUT_MS ?? 2500);
      const response = await fetch(
        `${baseUrl}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`,
        {
          headers: {
            "User-Agent":
              process.env.OPEN_FOOD_FACTS_USER_AGENT ??
              "SousChef/0.8.0 (https://github.com/gamerg21/sous-chef)",
          },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      if (response.status === 404) {
        return cached ? cachedResult(true) : { found: false, prefill: { barcode: code } };
      }
      if (!response.ok) {
        throw new Error(`Open Food Facts responded ${response.status}`);
      }
      const payload = (await response.json()) as {
        status?: number;
        product?: Record<string, unknown>;
      };
      const parsed = payload.status === 1 ? parseProduct(payload.product) : undefined;
      if (!parsed) {
        return cached ? cachedResult(true) : { found: false, prefill: { barcode: code } };
      }

      await ctx.runMutation(internal.barcodes.saveLookup, {
        code,
        name: parsed.name,
        attributionUrl: productUrl,
        ...parsed.facts,
      });

      return {
        found: true,
        prefill: { name: parsed.name, barcode: code, category: parsed.category },
        facts: parsed.facts as Record<string, unknown>,
        source: "open_food_facts",
        attribution: OFF_ATTRIBUTION(productUrl),
        stale: false,
      };
    } catch (error) {
      console.error("[barcodes] Open Food Facts lookup failed", error);
      if (cached) {
        return cachedResult(true);
      }
      throw new Error("Barcode lookup failed");
    }
  },
});
