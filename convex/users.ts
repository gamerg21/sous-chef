import {
  getAuthSessionId,
  getAuthUserId as getConvexAuthUserId,
} from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { query, mutation, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getAuthUserId } from "./helpers";
import { checkAndRecordRateLimit } from "./rateLimit";
import { isValidEmail, normalizeEmail } from "../src/lib/auth-utils";

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

    // This mutation is necessarily unauthenticated (it runs before sign-in
    // to recover accounts orphaned by the Prisma→Convex migration), so it is
    // rate-limited per email and always returns the same shape to avoid
    // acting as an account-enumeration oracle.
    const allowed = await checkAndRecordRateLimit(ctx, {
      scope: "auth-repair",
      subject: email,
      windowMs: 15 * 60 * 1000,
      max: 10,
    });
    if (!allowed) {
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

      // Keep the password sign-in identifier in sync so the user can still
      // log in with their new email.
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", userId).eq("provider", "password"),
        )
        .unique();
      if (account) {
        await ctx.db.patch(account._id, { providerAccountId: email });
      }
    }

    if (args.image !== undefined) patch.image = args.image;
    await ctx.db.patch(userId, patch);
    return { success: true };
  },
});

/**
 * Operator recovery path for when password-reset email delivery is not
 * configured. Call via the Convex CLI only:
 *   npx convex run users:setPasswordHashByEmail '{"email":"...","passwordHash":"..."}'
 * Hash the password first with scripts/set-temp-password.mjs so we match
 * the Scrypt format Convex Auth expects.
 */
export const setPasswordHashByEmail = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!isValidEmail(email)) {
      throw new Error("Invalid email address");
    }
    if (!args.passwordHash.includes(":")) {
      throw new Error("passwordHash must be a Lucia Scrypt hash (salt:digest)");
    }

    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", "password").eq("providerAccountId", email),
      )
      .unique();
    if (!account) {
      throw new Error(`No password account found for ${email}`);
    }

    await ctx.db.patch(account._id, { secret: args.passwordHash });

    // Drop outstanding reset codes so stale emailed/logged links can't be reused.
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) {
      await ctx.db.delete(code._id);
    }

    return { success: true, accountId: account._id, userId: account.userId };
  },
});
