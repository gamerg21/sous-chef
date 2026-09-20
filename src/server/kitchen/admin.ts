import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./helpers";
import { Id } from "./_generated/dataModel";
import { QueryCtx, MutationCtx } from "./_generated/server";

async function isAdmin(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<boolean> {
  const admin = await ctx.db
    .query("appAdmins")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return !!admin;
}

export const listUsers = query({
  args: {
    page: v.optional(v.number()),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!(await isAdmin(ctx, userId))) throw new Error("Admin access required");

    const limit = args.limit ?? 50;
    const page = args.page ?? 1;

    // Bounded scan: the admin table paginates client-side over this window.
    // Move to cursor pagination if the user base outgrows it.
    let users = await ctx.db.query("users").take(1000);

    if (args.search) {
      const search = args.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search),
      );
    }

    const total = users.length;
    const offset = (page - 1) * limit;
    const paginated = users.slice(offset, offset + limit);

    const result = [];
    for (const user of paginated) {
      const memberships = await ctx.db
        .query("householdMembers")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      const households = [];
      for (const m of memberships) {
        const h = await ctx.db.get(m.householdId);
        if (h) {
          households.push({
            householdId: String(h._id),
            householdName: h.name,
            role: m.role,
          });
        }
      }

      const userIsAdmin = await isAdmin(ctx, user._id);

      result.push({
        id: user._id,
        name: user.name ?? null,
        email: user.email ?? "",
        image: user.image ?? null,
        isAppAdmin: userIsAdmin,
        createdAt: new Date(user._creationTime).toISOString(),
        updatedAt: new Date(user._creationTime).toISOString(),
        households,
      });
    }

    return {
      users: result,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
});

export const updateUser = mutation({
  args: {
    userId: v.id("users"),
    name: v.optional(v.string()),
    isAppAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!(await isAdmin(ctx, currentUserId))) throw new Error("Admin access required");

    if (args.name !== undefined) {
      await ctx.db.patch(args.userId, { name: args.name });
    }

    if (args.isAppAdmin !== undefined) {
      const existing = await ctx.db
        .query("appAdmins")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique();

      if (args.isAppAdmin && !existing) {
        await ctx.db.insert("appAdmins", { userId: args.userId });
      } else if (!args.isAppAdmin && existing) {
        const admins = await ctx.db.query("appAdmins").take(2);
        if (admins.length <= 1) {
          throw new Error("Cannot remove the last admin");
        }
        await ctx.db.delete(existing._id);
      }
    }

    return { success: true };
  },
});

export const deleteUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const currentUserId = await getAuthUserId(ctx);
    if (!(await isAdmin(ctx, currentUserId))) throw new Error("Admin access required");
    if (args.userId === currentUserId) throw new Error("Cannot delete yourself");

    // Delete admin record
    const adminRecord = await ctx.db
      .query("appAdmins")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (adminRecord) await ctx.db.delete(adminRecord._id);

    // Delete memberships
    const memberships = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const m of memberships) await ctx.db.delete(m._id);

    // Delete preferences
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (prefs) await ctx.db.delete(prefs._id);

    // Delete community interactions and unit personalization data
    const likes = await ctx.db
      .query("communityRecipeLikes")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const like of likes) await ctx.db.delete(like._id);

    const saves = await ctx.db
      .query("communityRecipeSaves")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const save of saves) await ctx.db.delete(save._id);

    const unitUsage = await ctx.db
      .query("userUnitUsage")
      .withIndex("by_userId_and_unitId", (q) => q.eq("userId", args.userId))
      .collect();
    for (const usage of unitUsage) await ctx.db.delete(usage._id);

    const unitPrefs = await ctx.db
      .query("userIngredientUnitPreferences")
      .withIndex("by_userId_and_ingredientKey_and_unitId", (q) =>
        q.eq("userId", args.userId),
      )
      .collect();
    for (const pref of unitPrefs) await ctx.db.delete(pref._id);

    await ctx.db.delete(args.userId);
    return { success: true };
  },
});
