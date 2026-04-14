import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

export const repairOrphanedAuthUser = internalMutation({
  args: {
    orphanedUserId: v.id("users"),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const existingUser = await ctx.db.get(args.orphanedUserId);
    if (existingUser) {
      return existingUser._id;
    }

    const normalizedEmail =
      typeof args.email === "string" && args.email.trim().length > 0
        ? args.email.trim().toLowerCase()
        : undefined;
    const normalizedName =
      typeof args.name === "string" && args.name.trim().length > 0
        ? args.name.trim()
        : undefined;
    const normalizedImage =
      typeof args.image === "string" && args.image.trim().length > 0
        ? args.image.trim()
        : undefined;

    const userToReuse = normalizedEmail
      ? await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", normalizedEmail))
          .first()
      : null;

    const replacementUserId =
      userToReuse?._id ??
      (await ctx.db.insert("users", {
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(normalizedName ? { name: normalizedName } : {}),
        ...(normalizedImage ? { image: normalizedImage } : {}),
      }));

    const authAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const account of authAccounts) {
      await ctx.db.patch(account._id, { userId: replacementUserId });
    }

    const authSessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const session of authSessions) {
      await ctx.db.patch(session._id, { userId: replacementUserId });
    }

    const memberships = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const membership of memberships) {
      await ctx.db.patch(membership._id, { userId: replacementUserId });
    }

    const likes = await ctx.db
      .query("communityRecipeLikes")
      .withIndex("by_userId", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const like of likes) {
      await ctx.db.patch(like._id, { userId: replacementUserId });
    }

    const saves = await ctx.db
      .query("communityRecipeSaves")
      .withIndex("by_userId", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const save of saves) {
      await ctx.db.patch(save._id, { userId: replacementUserId });
    }

    const preferences = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const preference of preferences) {
      await ctx.db.patch(preference._id, { userId: replacementUserId });
    }

    const unitUsageRecords = await ctx.db
      .query("userUnitUsage")
      .withIndex("by_userId_and_unitId", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const usageRecord of unitUsageRecords) {
      await ctx.db.patch(usageRecord._id, { userId: replacementUserId });
    }

    const ingredientPreferences = await ctx.db
      .query("userIngredientUnitPreferences")
      .withIndex(
        "by_userId_and_ingredientKey_and_unitId",
        (q) => q.eq("userId", args.orphanedUserId),
      )
      .collect();

    for (const ingredientPreference of ingredientPreferences) {
      await ctx.db.patch(ingredientPreference._id, {
        userId: replacementUserId,
      });
    }

    const adminRecords = await ctx.db
      .query("appAdmins")
      .withIndex("by_userId", (q) => q.eq("userId", args.orphanedUserId))
      .collect();

    for (const adminRecord of adminRecords) {
      await ctx.db.patch(adminRecord._id, { userId: replacementUserId });
    }

    return replacementUserId;
  },
});
