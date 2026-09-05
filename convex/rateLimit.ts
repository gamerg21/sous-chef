import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";

/**
 * Deterministic 64-bit FNV-1a hash. Convex mutations run in a deterministic
 * runtime without crypto.subtle, so we use a plain-JS hash to avoid storing
 * raw identifiers in rate-limit rows. This is bucketing, not secrecy — the
 * same identifiers exist elsewhere in the database.
 */
function fnv1a32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function hashRateLimitSubject(value: string): string {
  const a = fnv1a32(value, 0x811c9dc5);
  const b = fnv1a32(value, 0x811c9dc5 ^ 0x5bd1e995);
  return (
    a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")
  );
}

// Mutations are called from the client without access to the request IP, so
// per-IP limiting is not possible here; all limits are per-subject.
const NO_IP = "n/a";

export type RateLimitOptions = {
  scope: string;
  subject: string;
  windowMs: number;
  max: number;
};

/**
 * Fixed-window rate limiter over the authRateLimitEvents table.
 * Returns true when the call is allowed (and records it), false when the
 * subject has exhausted the window.
 */
export async function checkAndRecordRateLimit(
  ctx: MutationCtx,
  { scope, subject, windowMs, max }: RateLimitOptions,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const subjectHash = hashRateLimitSubject(subject);

  const existing = await ctx.db
    .query("authRateLimitEvents")
    .withIndex("by_scope_and_subjectHash_and_ipHash_and_windowStart", (q) =>
      q
        .eq("scope", scope)
        .eq("subjectHash", subjectHash)
        .eq("ipHash", NO_IP)
        .eq("windowStart", windowStart),
    )
    .unique();

  if (existing) {
    if (existing.count >= max) {
      return false;
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return true;
  }

  // Opportunistically clear this subject's expired windows.
  const stale = await ctx.db
    .query("authRateLimitEvents")
    .withIndex("by_scope_and_subjectHash_and_ipHash_and_windowStart", (q) =>
      q
        .eq("scope", scope)
        .eq("subjectHash", subjectHash)
        .eq("ipHash", NO_IP)
        .lt("windowStart", windowStart),
    )
    .take(20);
  for (const row of stale) {
    await ctx.db.delete(row._id);
  }

  await ctx.db.insert("authRateLimitEvents", {
    scope,
    subjectHash,
    ipHash: NO_IP,
    windowStart,
    count: 1,
  });
  return true;
}

/**
 * Internal wrapper so actions (e.g. the password-reset email sender) can
 * enforce the same limits. Returns { allowed }.
 */
export const checkAndRecord = internalMutation({
  args: {
    scope: v.string(),
    subject: v.string(),
    windowMs: v.number(),
    max: v.number(),
  },
  handler: async (ctx, args) => {
    const allowed = await checkAndRecordRateLimit(ctx, args);
    return { allowed };
  },
});
