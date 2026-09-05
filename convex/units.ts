import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";
import { getAuthUserId } from "./helpers";

// The unit catalog is bounded by design (a few dozen rows), so reading it
// whole with .take() is safe and keeps ranking/search logic simple.
const CATALOG_LIMIT = 500;

export type UnitSummary = {
  id: Id<"units">;
  slug: string;
  name: string;
  abbr?: string;
  unitType: string;
  system: string;
  /** The string persisted on inventory/recipe/shopping rows. */
  label: string;
};

function toSummary(unit: Doc<"units">): UnitSummary {
  return {
    id: unit._id,
    slug: unit.slug,
    name: unit.name,
    abbr: unit.abbr,
    unitType: unit.unitType,
    system: unit.system,
    label: unit.abbr ?? unit.name,
  };
}

export function normalizeIngredientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Try to resolve an ingredient profile for a free-text ingredient name:
 * exact key first, then per-token lookup so "red onion" matches "onion".
 */
async function findIngredientProfile(
  ctx: QueryCtx,
  ingredientName: string,
): Promise<Doc<"ingredientUnitProfiles"> | null> {
  const key = normalizeIngredientKey(ingredientName);
  if (!key) return null;

  const exact = await ctx.db
    .query("ingredientUnitProfiles")
    .withIndex("by_ingredientKey", (q) => q.eq("ingredientKey", key))
    .unique();
  if (exact) return exact;

  const tokens = key.split(" ").filter((t) => t.length > 2);
  for (const token of tokens.reverse()) {
    const match = await ctx.db
      .query("ingredientUnitProfiles")
      .withIndex("by_ingredientKey", (q) => q.eq("ingredientKey", token))
      .unique();
    if (match) return match;
  }
  return null;
}

/**
 * Ranked suggestions for the unit combobox, per the unit-picker spec:
 * 1. the user's own habit for this ingredient
 * 2. ingredient profile default (pinned)
 * 3. ingredient profile recommendations
 * 4. the user's recently used units
 * 5. global common units, to fill up to `limit`
 */
export const suggest = query({
  args: {
    ingredientName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<UnitSummary[]> => {
    const userId = await getAuthUserId(ctx);
    const limit = Math.min(args.limit ?? 9, 15);

    const ranked: Id<"units">[] = [];
    const seen = new Set<string>();
    const push = (unitId: Id<"units">) => {
      if (!seen.has(unitId)) {
        seen.add(unitId);
        ranked.push(unitId);
      }
    };

    if (args.ingredientName) {
      const key = normalizeIngredientKey(args.ingredientName);

      // 1. Personal per-ingredient habit
      const prefs = await ctx.db
        .query("userIngredientUnitPreferences")
        .withIndex("by_userId_and_ingredientKey_and_unitId", (q) =>
          q.eq("userId", userId).eq("ingredientKey", key),
        )
        .take(10);
      prefs.sort((a, b) => b.count - a.count);
      for (const pref of prefs.slice(0, 2)) push(pref.unitId);

      // 2 + 3. Ingredient profile default and recommendations
      const profile = await findIngredientProfile(ctx, args.ingredientName);
      if (profile) {
        if (profile.defaultUnitId) push(profile.defaultUnitId);
        const recs = await ctx.db
          .query("ingredientUnitProfileRecommendations")
          .withIndex("by_profileId_and_rank", (q) =>
            q.eq("profileId", profile._id),
          )
          .take(10);
        for (const rec of recs) push(rec.unitId);
      }
    }

    // 4. Recently used units
    const recent = await ctx.db
      .query("userUnitUsage")
      .withIndex("by_userId_and_lastUsedAt", (q) => q.eq("userId", userId))
      .order("desc")
      .take(5);
    for (const usage of recent) push(usage.unitId);

    // 5. Global commons
    if (ranked.length < limit) {
      const all = await ctx.db.query("units").take(CATALOG_LIMIT);
      const commons = all.filter((u) => u.isCommon && u.isEnabled);
      for (const unit of commons) {
        if (ranked.length >= limit) break;
        push(unit._id);
      }
    }

    const results: UnitSummary[] = [];
    for (const unitId of ranked.slice(0, limit)) {
      const unit = await ctx.db.get(unitId);
      if (unit && unit.isEnabled) results.push(toSummary(unit));
    }
    return results;
  },
});

/**
 * Alias-aware search. Matches canonical names, abbreviations, and aliases
 * case-insensitively (exact > prefix > substring), boosted by usage.
 */
export const search = query({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<UnitSummary[]> => {
    const userId = await getAuthUserId(ctx);
    const term = args.query.trim().toLowerCase();
    const limit = Math.min(args.limit ?? 10, 25);
    if (!term) return [];

    const [units, aliases, usage] = await Promise.all([
      ctx.db.query("units").take(CATALOG_LIMIT),
      ctx.db.query("unitAliases").take(CATALOG_LIMIT * 4),
      ctx.db
        .query("userUnitUsage")
        .withIndex("by_userId_and_lastUsedAt", (q) => q.eq("userId", userId))
        .take(50),
    ]);

    const usageByUnit = new Map(usage.map((u) => [u.unitId, u.count]));
    const unitById = new Map(units.map((u) => [u._id, u]));

    // score: exact 100 / prefix 60 / substring 30, alias priority and usage
    // as tie-breakers.
    const scores = new Map<Id<"units">, number>();
    const consider = (
      unitId: Id<"units">,
      candidate: string,
      priority: number,
    ) => {
      const text = candidate.toLowerCase();
      let score = 0;
      if (text === term) score = 100;
      else if (text.startsWith(term)) score = 60;
      else if (text.includes(term)) score = 30;
      if (score === 0) return;
      score += priority + Math.min(usageByUnit.get(unitId) ?? 0, 20);
      const unit = unitById.get(unitId);
      if (!unit || !unit.isEnabled) return;
      scores.set(unitId, Math.max(scores.get(unitId) ?? 0, score));
    };

    for (const unit of units) {
      consider(unit._id, unit.name, 10);
      if (unit.abbr) consider(unit._id, unit.abbr, 10);
      consider(unit._id, unit.slug, 5);
    }
    for (const alias of aliases) {
      consider(alias.unitId, alias.alias, alias.priority);
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([unitId]) => toSummary(unitById.get(unitId)!));
  },
});

/**
 * Full catalog grouped for the "More units…" modal.
 */
export const listGrouped = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const units = await ctx.db.query("units").take(CATALOG_LIMIT);

    const groupOf = (unit: Doc<"units">): string => {
      switch (unit.unitType) {
        case "volume":
          return unit.system === "metric" ? "Volume (Metric)" : "Volume (US)";
        case "mass":
          return unit.system === "metric" ? "Weight (Metric)" : "Weight (US)";
        case "count":
          return "Countables";
        case "package":
          return "Packages";
        case "qualitative":
          return "Qualitative";
        case "time":
          return "Time";
        case "temperature":
          return "Temperature";
        default:
          return "Other";
      }
    };

    const groups = new Map<string, UnitSummary[]>();
    for (const unit of units) {
      if (!unit.isEnabled) continue;
      const group = groupOf(unit);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(toSummary(unit));
    }

    const order = [
      "Countables",
      "Volume (US)",
      "Volume (Metric)",
      "Weight (US)",
      "Weight (Metric)",
      "Packages",
      "Qualitative",
      "Time",
      "Temperature",
      "Other",
    ];
    return order
      .filter((name) => groups.has(name))
      .map((name) => ({
        name,
        units: groups
          .get(name)!
          .sort((a, b) => a.name.localeCompare(b.name)),
      }));
  },
});

/**
 * Record that the user picked a unit (optionally for an ingredient) so
 * future suggestions can be re-ranked by habit.
 */
export const trackUsage = mutation({
  args: {
    unitId: v.id("units"),
    ingredientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) throw new Error("Unit not found");
    const now = Date.now();

    const usage = await ctx.db
      .query("userUnitUsage")
      .withIndex("by_userId_and_unitId", (q) =>
        q.eq("userId", userId).eq("unitId", args.unitId),
      )
      .unique();
    if (usage) {
      await ctx.db.patch(usage._id, {
        count: usage.count + 1,
        lastUsedAt: now,
      });
    } else {
      await ctx.db.insert("userUnitUsage", {
        userId,
        unitId: args.unitId,
        count: 1,
        lastUsedAt: now,
      });
    }

    if (args.ingredientName) {
      const key = normalizeIngredientKey(args.ingredientName);
      if (key) {
        const pref = await ctx.db
          .query("userIngredientUnitPreferences")
          .withIndex("by_userId_and_ingredientKey_and_unitId", (q) =>
            q
              .eq("userId", userId)
              .eq("ingredientKey", key)
              .eq("unitId", args.unitId),
          )
          .unique();
        if (pref) {
          await ctx.db.patch(pref._id, {
            count: pref.count + 1,
            lastUsedAt: now,
          });
        } else {
          await ctx.db.insert("userIngredientUnitPreferences", {
            userId,
            ingredientKey: key,
            unitId: args.unitId,
            count: 1,
            lastUsedAt: now,
          });
        }
      }
    }
    return { success: true };
  },
});

// ── Seed data ────────────────────────────────────────────────────────────

type SeedUnit = {
  slug: string;
  name: string;
  abbr?: string;
  unitType: string;
  system: "us" | "metric" | "neutral";
  /** slug of the base unit for this type, when convertible */
  base?: string;
  toBaseFactor?: number;
  isCommon?: boolean;
  aliases?: Array<string | [string, number]>;
};

const SEED_UNITS: SeedUnit[] = [
  // Count
  { slug: "each", name: "each", abbr: "each", unitType: "count", system: "neutral", isCommon: true, aliases: ["ea", "count", "piece", "pieces", "pc", "unit"] },
  { slug: "clove", name: "clove", unitType: "count", system: "neutral", isCommon: true, aliases: ["cloves"] },
  { slug: "slice", name: "slice", unitType: "count", system: "neutral", isCommon: true, aliases: ["slices"] },
  { slug: "bunch", name: "bunch", unitType: "count", system: "neutral", aliases: ["bunches"] },
  { slug: "sprig", name: "sprig", unitType: "count", system: "neutral", aliases: ["sprigs"] },
  { slug: "stick", name: "stick", unitType: "count", system: "neutral", aliases: ["sticks"] },
  // Volume (US) — base: milliliter
  { slug: "teaspoon", name: "teaspoon", abbr: "tsp", unitType: "volume", system: "us", base: "milliliter", toBaseFactor: 4.92892, isCommon: true, aliases: ["tsp.", ["ts", 5], "teaspoons", "tea spoon"] },
  { slug: "tablespoon", name: "tablespoon", abbr: "tbsp", unitType: "volume", system: "us", base: "milliliter", toBaseFactor: 14.7868, isCommon: true, aliases: ["tbsp.", ["T", 5], "tablespoons", "tbl"] },
  { slug: "cup", name: "cup", abbr: "cup", unitType: "volume", system: "us", base: "milliliter", toBaseFactor: 236.588, isCommon: true, aliases: [["c", 5], "cups"] },
  { slug: "fluid-ounce", name: "fluid ounce", abbr: "fl oz", unitType: "volume", system: "us", base: "milliliter", toBaseFactor: 29.5735, aliases: ["floz", ["fl", 5], "fluid ounces"] },
  { slug: "pint", name: "pint", abbr: "pt", unitType: "volume", system: "us", base: "milliliter", toBaseFactor: 473.176, aliases: ["pints"] },
  { slug: "quart", name: "quart", abbr: "qt", unitType: "volume", system: "us", base: "milliliter", toBaseFactor: 946.353, aliases: ["quarts"] },
  { slug: "gallon", name: "gallon", abbr: "gal", unitType: "volume", system: "us", base: "milliliter", toBaseFactor: 3785.41, aliases: ["gallons"] },
  // Volume (Metric)
  { slug: "milliliter", name: "milliliter", abbr: "ml", unitType: "volume", system: "metric", toBaseFactor: 1, isCommon: true, aliases: ["mL", "millilitre", "milliliters", "millilitres"] },
  { slug: "liter", name: "liter", abbr: "l", unitType: "volume", system: "metric", base: "milliliter", toBaseFactor: 1000, isCommon: true, aliases: ["L", "litre", "liters", "litres"] },
  // Mass — base: gram
  { slug: "gram", name: "gram", abbr: "g", unitType: "mass", system: "metric", toBaseFactor: 1, isCommon: true, aliases: ["grams", "gr"] },
  { slug: "kilogram", name: "kilogram", abbr: "kg", unitType: "mass", system: "metric", base: "gram", toBaseFactor: 1000, isCommon: true, aliases: ["kilograms", "kilo", "kilos"] },
  { slug: "ounce", name: "ounce", abbr: "oz", unitType: "mass", system: "us", base: "gram", toBaseFactor: 28.3495, isCommon: true, aliases: ["oz.", "ounces"] },
  { slug: "pound", name: "pound", abbr: "lb", unitType: "mass", system: "us", base: "gram", toBaseFactor: 453.592, isCommon: true, aliases: ["lbs", "#", "pounds", "lb."] },
  // Temperature
  { slug: "fahrenheit", name: "Fahrenheit", abbr: "°F", unitType: "temperature", system: "us", aliases: ["F", "degrees F", "deg F"] },
  { slug: "celsius", name: "Celsius", abbr: "°C", unitType: "temperature", system: "metric", aliases: ["C", "degrees C", "deg C"] },
  // Time — base: second
  { slug: "second", name: "second", abbr: "sec", unitType: "time", system: "neutral", toBaseFactor: 1, aliases: ["seconds", "s"] },
  { slug: "minute", name: "minute", abbr: "min", unitType: "time", system: "neutral", base: "second", toBaseFactor: 60, aliases: ["minutes", "mins"] },
  { slug: "hour", name: "hour", abbr: "hr", unitType: "time", system: "neutral", base: "second", toBaseFactor: 3600, aliases: ["hours", "hrs", "h"] },
  // Packages
  { slug: "can", name: "can", unitType: "package", system: "neutral", isCommon: true, aliases: ["cans"] },
  { slug: "jar", name: "jar", unitType: "package", system: "neutral", aliases: ["jars"] },
  { slug: "bottle", name: "bottle", unitType: "package", system: "neutral", aliases: ["bottles"] },
  { slug: "box", name: "box", unitType: "package", system: "neutral", aliases: ["boxes"] },
  { slug: "bag", name: "bag", unitType: "package", system: "neutral", aliases: ["bags"] },
  { slug: "package", name: "package", abbr: "pkg", unitType: "package", system: "neutral", aliases: ["packages", "pack", "packet"] },
  // Qualitative
  { slug: "to-taste", name: "to taste", unitType: "qualitative", system: "neutral", isCommon: true, aliases: ["taste"] },
  { slug: "as-needed", name: "as needed", unitType: "qualitative", system: "neutral", aliases: ["needed"] },
  { slug: "for-garnish", name: "for garnish", unitType: "qualitative", system: "neutral", aliases: ["garnish"] },
  { slug: "optional", name: "optional", unitType: "qualitative", system: "neutral", aliases: [] },
];

type SeedProfile = {
  key: string;
  defaultUnit: string;
  recommended: string[];
};

const SEED_PROFILES: SeedProfile[] = [
  { key: "onion", defaultUnit: "each", recommended: ["each", "cup", "slice"] },
  { key: "garlic", defaultUnit: "clove", recommended: ["clove", "each", "teaspoon"] },
  { key: "milk", defaultUnit: "cup", recommended: ["cup", "milliliter", "liter", "fluid-ounce"] },
  { key: "salt", defaultUnit: "teaspoon", recommended: ["teaspoon", "tablespoon", "to-taste"] },
  { key: "pepper", defaultUnit: "teaspoon", recommended: ["teaspoon", "to-taste"] },
  { key: "butter", defaultUnit: "tablespoon", recommended: ["tablespoon", "stick", "gram", "ounce"] },
  { key: "flour", defaultUnit: "cup", recommended: ["cup", "gram", "tablespoon"] },
  { key: "sugar", defaultUnit: "cup", recommended: ["cup", "gram", "tablespoon", "teaspoon"] },
  { key: "egg", defaultUnit: "each", recommended: ["each"] },
  { key: "eggs", defaultUnit: "each", recommended: ["each"] },
  { key: "rice", defaultUnit: "cup", recommended: ["cup", "gram"] },
  { key: "oil", defaultUnit: "tablespoon", recommended: ["tablespoon", "teaspoon", "cup", "milliliter"] },
  { key: "water", defaultUnit: "cup", recommended: ["cup", "milliliter", "liter"] },
  { key: "cheese", defaultUnit: "cup", recommended: ["cup", "gram", "ounce", "slice"] },
  { key: "chicken", defaultUnit: "pound", recommended: ["pound", "gram", "each"] },
];

/**
 * Idempotent catalog seed. Run with: npx convex run units:seed
 * (or pnpm seed:units). Safe to re-run; existing slugs are updated.
 */
export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const idBySlug = new Map<string, Id<"units">>();

    // Two passes so baseUnitId references resolve regardless of order.
    for (const unit of SEED_UNITS) {
      const existing = await ctx.db
        .query("units")
        .withIndex("by_slug", (q) => q.eq("slug", unit.slug))
        .unique();
      const fields = {
        slug: unit.slug,
        name: unit.name,
        abbr: unit.abbr,
        unitType: unit.unitType,
        system: unit.system,
        toBaseFactor: unit.toBaseFactor,
        isCommon: unit.isCommon ?? false,
        isEnabled: true,
      };
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        idBySlug.set(unit.slug, existing._id);
      } else {
        idBySlug.set(unit.slug, await ctx.db.insert("units", fields));
      }
    }

    for (const unit of SEED_UNITS) {
      if (!unit.base) continue;
      const unitId = idBySlug.get(unit.slug)!;
      const baseUnitId = idBySlug.get(unit.base);
      if (baseUnitId) {
        await ctx.db.patch(unitId, { baseUnitId });
      }
    }

    let aliasCount = 0;
    for (const unit of SEED_UNITS) {
      const unitId = idBySlug.get(unit.slug)!;
      for (const entry of unit.aliases ?? []) {
        const [alias, priority] = Array.isArray(entry) ? entry : [entry, 1];
        const existing = await ctx.db
          .query("unitAliases")
          .withIndex("by_unitId_and_alias", (q) =>
            q.eq("unitId", unitId).eq("alias", alias),
          )
          .unique();
        if (!existing) {
          await ctx.db.insert("unitAliases", { unitId, alias, priority });
          aliasCount++;
        }
      }
    }

    let profileCount = 0;
    for (const profile of SEED_PROFILES) {
      const defaultUnitId = idBySlug.get(profile.defaultUnit);
      let existing = await ctx.db
        .query("ingredientUnitProfiles")
        .withIndex("by_ingredientKey", (q) =>
          q.eq("ingredientKey", profile.key),
        )
        .unique();
      let profileId: Id<"ingredientUnitProfiles">;
      if (existing) {
        await ctx.db.patch(existing._id, { defaultUnitId });
        profileId = existing._id;
      } else {
        profileId = await ctx.db.insert("ingredientUnitProfiles", {
          ingredientKey: profile.key,
          defaultUnitId,
        });
        profileCount++;
      }
      for (let rank = 0; rank < profile.recommended.length; rank++) {
        const unitId = idBySlug.get(profile.recommended[rank]);
        if (!unitId) continue;
        const rec = await ctx.db
          .query("ingredientUnitProfileRecommendations")
          .withIndex("by_profileId_and_unitId", (q) =>
            q.eq("profileId", profileId).eq("unitId", unitId),
          )
          .unique();
        if (rec) {
          await ctx.db.patch(rec._id, { rank });
        } else {
          await ctx.db.insert("ingredientUnitProfileRecommendations", {
            profileId,
            unitId,
            rank,
          });
        }
      }
    }

    return {
      units: SEED_UNITS.length,
      newAliases: aliasCount,
      newProfiles: profileCount,
    };
  },
});
