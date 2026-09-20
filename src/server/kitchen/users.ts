import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "./helpers";
import { isValidEmail, normalizeEmail } from "../../lib/auth-utils";
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    return {
      user: {
        id: user._id,
        name: user.name ?? null,
        email: user.email ?? "",
        image: user.image ?? null,
        emailVerified: user.emailVerificationTime
          ? new Date(user.emailVerificationTime).toISOString()
          : null,
        createdAt: new Date(user._creationTime).toISOString(),
      },
    };
  },
});

export const ensureCurrentUser = mutation({args: {}, handler: async ctx => ({userId: await getAuthUserId(ctx), repaired: false})});
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const patch: Record<string, string | undefined> = {};
    if (args.name !== undefined) patch.name = args.name;

    if (args.email !== undefined) {
      const email = normalizeEmail(args.email);
      if (!isValidEmail(email)) {
        throw new Error("Invalid email address");
      }
      const existing = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .first();
      if (existing && existing._id !== userId) {
        throw new Error("That email is already in use");
      }
      patch.email = email;


    }

    if (args.image !== undefined) patch.image = args.image;
    await ctx.db.patch(userId, patch);
    return { success: true };
  },
});
