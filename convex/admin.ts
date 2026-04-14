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

    let users = await ctx.db.query("users").collect();

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

    // Delete auth sessions and refresh tokens
    const authSessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .collect();

    for (const authSession of authSessions) {
      const refreshTokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", authSession._id))
        .collect();

      for (const refreshToken of refreshTokens) {
        await ctx.db.delete(refreshToken._id);
      }

      await ctx.db.delete(authSession._id);
    }

    // Delete auth accounts and verification codes
    const authAccounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", args.userId))
      .collect();

    for (const authAccount of authAccounts) {
      const verificationCodes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", authAccount._id))
        .collect();

      for (const verificationCode of verificationCodes) {
        await ctx.db.delete(verificationCode._id);
      }

      await ctx.db.delete(authAccount._id);
    }

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

    await ctx.db.delete(args.userId);
    return { success: true };
  },
});
