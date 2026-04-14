import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  getAuthUserId,
  ensureUserHasHousehold,
  createDefaultHousehold,
  getHouseholdMembership,
} from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const memberships = await ctx.db
      .query("householdMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const households = [];
    for (const m of memberships) {
      const h = await ctx.db.get(m.householdId);
      if (h) {
        households.push({
          id: h._id,
          name: h.name,
          role: m.role,
        });
      }
    }
    return households;
  },
});

export const ensureHousehold = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const householdId = await ensureUserHasHousehold(ctx, userId);
    return householdId;
  },
});

export const create = mutation({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (args.name) {
      const householdId = await ctx.db.insert("households", { name: args.name });
      await ctx.db.insert("householdMembers", {
        userId,
        householdId,
        role: "owner",
      });
      for (const locName of ["Pantry", "Fridge", "Freezer"]) {
        await ctx.db.insert("kitchenLocations", { householdId, name: locName });
      }
      await ctx.db.insert("shoppingLists", { householdId });
      return householdId;
    }
    return await createDefaultHousehold(ctx, userId);
  },
});

export const get = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const membership = await getHouseholdMembership(ctx, userId, args.householdId);
    if (!membership) throw new Error("Not a member of this household");
    const h = await ctx.db.get(args.householdId);
    if (!h) throw new Error("Household not found");
    return { id: h._id, name: h.name, role: membership.role };
  },
});

export const update = mutation({
  args: { householdId: v.id("households"), name: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const membership = await getHouseholdMembership(ctx, userId, args.householdId);
    if (!membership || membership.role === "member") {
      throw new Error("Permission denied");
    }
    await ctx.db.patch(args.householdId, { name: args.name });
    return { success: true };
  },
});

export const remove = mutation({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const membership = await getHouseholdMembership(ctx, userId, args.householdId);
    if (!membership || membership.role !== "owner") {
      throw new Error("Only the owner can delete a household");
    }
    // Delete all related data
    const members = await ctx.db
      .query("householdMembers")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);

    const locations = await ctx.db
      .query("kitchenLocations")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .collect();
    for (const l of locations) await ctx.db.delete(l._id);

    const items = await ctx.db
      .query("inventoryItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .collect();
    for (const i of items) await ctx.db.delete(i._id);

    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .collect();
    for (const r of recipes) {
      const ings = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", r._id))
        .collect();
      for (const ing of ings) await ctx.db.delete(ing._id);
      const steps = await ctx.db
        .query("recipeSteps")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", r._id))
        .collect();
      for (const s of steps) await ctx.db.delete(s._id);
      await ctx.db.delete(r._id);
    }

    const sl = await ctx.db
      .query("shoppingLists")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .first();
    if (sl) {
      const slItems = await ctx.db
        .query("shoppingListItems")
        .withIndex("by_shoppingListId", (q) => q.eq("shoppingListId", sl._id))
        .collect();
      for (const si of slItems) await ctx.db.delete(si._id);
      await ctx.db.delete(sl._id);
    }

    await ctx.db.delete(args.householdId);
    return { success: true };
  },
});

export const getMembers = query({
  args: { householdId: v.id("households") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const membership = await getHouseholdMembership(ctx, userId, args.householdId);
    if (!membership) throw new Error("Not a member");

    const members = await ctx.db
      .query("householdMembers")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .collect();

    const users = [];
    for (const m of members) {
      const user = await ctx.db.get(m.userId);
      if (user) {
        users.push({
          id: user._id,
          name: user.name ?? null,
          email: user.email ?? "",
          image: user.image ?? null,
          role: m.role,
          joinedAt: new Date(m._creationTime).toISOString(),
          createdAt: new Date(user._creationTime).toISOString(),
        });
      }
    }
    return { users };
  },
});

export const addMember = mutation({
  args: {
    householdId: v.id("households"),
    email: v.string(),
    role: v.optional(
      v.union(v.literal("admin"), v.literal("member")),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const membership = await getHouseholdMembership(ctx, userId, args.householdId);
    if (!membership || membership.role === "member") {
      throw new Error("Permission denied");
    }

    // Find user by email
    const targetUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();
    if (!targetUser) throw new Error("User not found");

    // Check not already member
    const existing = await getHouseholdMembership(ctx, targetUser._id, args.householdId);
    if (existing) throw new Error("User is already a member");

    await ctx.db.insert("householdMembers", {
      userId: targetUser._id,
      householdId: args.householdId,
      role: args.role ?? "member",
    });
    return { success: true };
  },
});

export const updateMember = mutation({
  args: {
    householdId: v.id("households"),
    memberId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const actorMembership = await getHouseholdMembership(ctx, userId, args.householdId);
    if (!actorMembership || actorMembership.role === "member") {
      throw new Error("Permission denied");
    }
    if (args.role === "owner" && actorMembership.role !== "owner") {
      throw new Error("Only owners can assign owner role");
    }

    const targetMembership = await getHouseholdMembership(
      ctx,
      args.memberId,
      args.householdId,
    );
    if (!targetMembership) throw new Error("Member not found");

    await ctx.db.patch(targetMembership._id, { role: args.role });
    return { success: true };
  },
});

export const removeMember = mutation({
  args: {
    householdId: v.id("households"),
    memberId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const actorMembership = await getHouseholdMembership(ctx, userId, args.householdId);
    if (!actorMembership || actorMembership.role === "member") {
      throw new Error("Permission denied");
    }

    const targetMembership = await getHouseholdMembership(
      ctx,
      args.memberId,
      args.householdId,
    );
    if (!targetMembership) throw new Error("Member not found");
    if (targetMembership.role === "owner") {
      throw new Error("Cannot remove the owner");
    }

    await ctx.db.delete(targetMembership._id);
    return { success: true };
  },
});
