import {
  getAuthSessionId,
  getAuthUserId as getConvexAuthUserId,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./helpers";
import { normalizeEmail } from "../src/lib/auth-utils";

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

export const ensureCurrentUser = mutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ userId: Id<"users">; repaired: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const identityWithImage = identity as typeof identity & {
      image?: string;
      pictureUrl?: string;
    };

    const claimedUserId = await getConvexAuthUserId(ctx);
    if (!claimedUserId) {
      throw new Error("Not authenticated");
    }

    const claimedUser = await ctx.db.get(claimedUserId);
    if (claimedUser) {
      return { userId: claimedUser._id, repaired: false };
    }

    const sessionId = await getAuthSessionId(ctx);
    if (!sessionId) {
      throw new Error("Authenticated session not found");
    }

    const session = await ctx.db.get(sessionId);
    if (session) {
      const sessionUser = await ctx.db.get(session.userId);
      if (sessionUser) {
        return { userId: sessionUser._id, repaired: false };
      }
    }

    const repairedUserId: Id<"users"> = await ctx.runMutation(
      internal.authRepair.repairOrphanedAuthUser,
      {
        orphanedUserId: session?.userId ?? claimedUserId,
        email: typeof identity.email === "string" ? identity.email : undefined,
        name: typeof identity.name === "string" ? identity.name : undefined,
        image:
          typeof identityWithImage.pictureUrl === "string"
            ? identityWithImage.pictureUrl
            : typeof identityWithImage.image === "string"
              ? identityWithImage.image
              : undefined,
      },
    );

    return { userId: repairedUserId, repaired: true };
  },
});

export const repairPasswordAccountByEmail = mutation({
  args: {
    email: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ repaired: boolean }> => {
    const email = normalizeEmail(args.email);
    if (!email) {
      return { repaired: false };
    }

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();

    if (!account) {
      return { repaired: false };
    }

    const accountUser = await ctx.db.get(account.userId);
    if (accountUser) {
      return { repaired: false };
    }

    await ctx.runMutation(internal.authRepair.repairOrphanedAuthUser, {
      orphanedUserId: account.userId,
      email,
    });

    return { repaired: true };
  },
});

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
    if (args.email !== undefined) patch.email = args.email;
    if (args.image !== undefined) patch.image = args.image;
    await ctx.db.patch(userId, patch);
    return { success: true };
  },
});
