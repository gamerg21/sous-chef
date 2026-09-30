import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./helpers";
import { MAX_EXPIRING_WITHIN_DAYS, expiringWindow } from "../../lib/expiring";
import { expiryDigestAvailable } from "./email";

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
    const expiry = {
      expiringWithinDays: expiringWindow(prefs?.expiringWithinDays),
      expiryDigestEmail: prefs?.expiryDigestEmail ?? false,
      // The digest toggle only works where the server can send email.
      expiryDigestAvailable: expiryDigestAvailable(await ctx.db.get(userId)),
    };
    if (!prefs) {
      return {
        preferences: {
          measurementSystem: DEFAULTS.measurementSystem,
          defaultWeightUnit: DEFAULTS.defaultWeightUnit,
          defaultVolumeUnit: DEFAULTS.defaultVolumeUnit,
          timezone: null,
          dateFormat: DEFAULTS.dateFormat,
          ...expiry,
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
        ...expiry,
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
    expiringWithinDays: v.optional(v.number()),
    expiryDigestEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (args.expiringWithinDays !== undefined && (!Number.isInteger(args.expiringWithinDays) || args.expiringWithinDays < 1 || args.expiringWithinDays > MAX_EXPIRING_WITHIN_DAYS)) {
      throw new Error(`Choose between 1 and ${MAX_EXPIRING_WITHIN_DAYS} days`);
    }
    if (args.expiryDigestEmail && !expiryDigestAvailable(await ctx.db.get(userId))) {
      throw new Error("Email isn't set up on this server");
    }
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      const patch: Record<string, string | number | boolean | undefined> = {};
      if (args.expiringWithinDays !== undefined) patch.expiringWithinDays = args.expiringWithinDays;
      if (args.expiryDigestEmail !== undefined) patch.expiryDigestEmail = args.expiryDigestEmail;
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
        expiringWithinDays: args.expiringWithinDays,
        expiryDigestEmail: args.expiryDigestEmail,
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
