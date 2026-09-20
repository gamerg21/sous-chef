import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./helpers";

const DEFAULTS = {
  measurementSystem: "metric",
  defaultWeightUnit: "g",
  defaultVolumeUnit: "ml",
  timezone: undefined,
  dateFormat: "YYYY-MM-DD",
} as const;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!prefs) {
      return {
        preferences: {
          measurementSystem: DEFAULTS.measurementSystem,
          defaultWeightUnit: DEFAULTS.defaultWeightUnit,
          defaultVolumeUnit: DEFAULTS.defaultVolumeUnit,
          timezone: null,
          dateFormat: DEFAULTS.dateFormat,
        },
      };
    }
    return {
      preferences: {
        measurementSystem: prefs.measurementSystem,
        defaultWeightUnit: prefs.defaultWeightUnit,
        defaultVolumeUnit: prefs.defaultVolumeUnit,
        timezone: prefs.timezone ?? null,
        dateFormat: prefs.dateFormat ?? DEFAULTS.dateFormat,
      },
    };
  },
});

export const update = mutation({
  args: {
    measurementSystem: v.optional(v.string()),
    defaultWeightUnit: v.optional(v.string()),
    defaultVolumeUnit: v.optional(v.string()),
    timezone: v.optional(v.union(v.string(), v.null())),
    dateFormat: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      const patch: Record<string, string | undefined> = {};
      if (args.measurementSystem !== undefined)
        patch.measurementSystem = args.measurementSystem;
      if (args.defaultWeightUnit !== undefined)
        patch.defaultWeightUnit = args.defaultWeightUnit;
      if (args.defaultVolumeUnit !== undefined)
        patch.defaultVolumeUnit = args.defaultVolumeUnit;
      if (args.timezone !== undefined)
        patch.timezone = args.timezone ?? undefined;
      if (args.dateFormat !== undefined)
        patch.dateFormat = args.dateFormat ?? undefined;
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        measurementSystem: args.measurementSystem ?? DEFAULTS.measurementSystem,
        defaultWeightUnit: args.defaultWeightUnit ?? DEFAULTS.defaultWeightUnit,
        defaultVolumeUnit: args.defaultVolumeUnit ?? DEFAULTS.defaultVolumeUnit,
        timezone: args.timezone ?? undefined,
        dateFormat: args.dateFormat ?? DEFAULTS.dateFormat,
      });
    }
    return { success: true };
  },
});

export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        measurementSystem: DEFAULTS.measurementSystem,
        defaultWeightUnit: DEFAULTS.defaultWeightUnit,
        defaultVolumeUnit: DEFAULTS.defaultVolumeUnit,
        timezone: undefined,
        dateFormat: DEFAULTS.dateFormat,
      });
    }
    return { success: true };
  },
});
