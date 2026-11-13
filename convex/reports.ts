// Reports and the moderator queue of API v2. Reporter identities are stored
// only as hashes and never leave this module.
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { internalAction, internalMutation, internalQuery, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { COMMUNITY_LIMITS, REPORT_REASON_LABELS, type Report } from '../src/lib/community-contract';
import { DEFAULT_DISPLAY_NAME } from './appleAuth';
import { checkAndRecordRateLimit } from './rateLimit';
import { authorOf, hideMade, isModerator, removeRecipe, shareUrlOf, syncRecipe, type AuthorCache } from './hubLib';
import { banCook } from './moderation';
import { reportReasonValidator, reportStatusValidator } from './schema';
import { fail, ok, type Result } from './community';

const HOUR = 3_600_000;
type Target = Pick<Doc<'hubReports'>, 'recipeId' | 'tipId'>;

/** Open reports about the same recipe or the same tip. */
async function openReportsOn(ctx: QueryCtx, target: Target) {
  const open = await ctx.db.query('hubReports').withIndex('by_recipeId_and_status', (q) => q.eq('recipeId', target.recipeId).eq('status', 'open')).take(500);
  return open.filter((report) => report.tipId === target.tipId);
}

/** Email goes out only when the deployment has all three settings. */
const emailSettings = () => {
  const { RESEND_API_KEY: key, SMTP_FROM: from, MODERATION_EMAIL: to } = process.env;
  return key && from && to ? { key, from, to } : null;
};

/**
 * POST /api/v2/report. `reporter` is a hash made by the HTTP action from the
 * signed-in user, else the client key, else the address. A second report by
 * the same reporter on the same target while one is open changes nothing.
 */
export const report = internalMutation({
  args: {
    recipeId: v.string(), tipId: v.optional(v.string()), reason: reportReasonValidator, note: v.optional(v.string()),
    reporter: v.string(), reporterGroup: v.string(), address: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<Result<{ success: true }>> => {
    const withinLimits =
      (await checkAndRecordRateLimit(ctx, { scope: 'community-report-address', subject: args.address, windowMs: HOUR, max: 30 })) &&
      (await checkAndRecordRateLimit(ctx, { scope: 'community-report-reporter', subject: args.reporter, windowMs: HOUR, max: 10 }));
    if (!withinLimits) return fail(429, 'Too many reports. Try again later.');
    const recipeId = ctx.db.normalizeId('hubRecipes', args.recipeId);
    const recipe = recipeId && (await ctx.db.get(recipeId));
    // A recipe already under review can still be reported; a private or removed one can't.
    if (!recipe || recipe.visibility === 'private' || recipe.removedAt) return fail(404, 'Not found');
    let tipId: Id<'hubMade'> | undefined;
    if (args.tipId !== undefined) {
      const id = ctx.db.normalizeId('hubMade', args.tipId);
      const tip = id && (await ctx.db.get(id));
      if (!tip || tip.recipeId !== recipe._id || tip.hidden) return fail(404, 'Not found');
      tipId = tip._id;
    }
    const note = args.note?.trim().slice(0, COMMUNITY_LIMITS.reportNote) || undefined;

    const mine = await ctx.db
      .query('hubReports')
      .withIndex('by_reporter_and_recipeId_and_status', (q) => q.eq('reporter', args.reporter).eq('recipeId', recipe._id).eq('status', 'open'))
      .take(100);
    if (mine.some((existing) => existing.tipId === tipId)) return ok({ success: true });

    const reportId = await ctx.db.insert('hubReports', { recipeId: recipe._id, tipId, reporter: args.reporter, reporterGroup: args.reporterGroup, reason: args.reason, note, status: 'open' });
    if (!tipId && !recipe.underReview) {
      // Reporters a moderator already overruled on this recipe don't count toward holding it again.
      const dismissed = await ctx.db.query('hubReports').withIndex('by_recipeId_and_status', (q) => q.eq('recipeId', recipe._id).eq('status', 'dismissed')).take(500);
      const overruled = new Set(dismissed.filter((old) => !old.tipId).map((old) => old.reporterGroup ?? old.reporter));
      const reporters = new Set((await openReportsOn(ctx, { recipeId: recipe._id, tipId: undefined })).map((open) => open.reporterGroup ?? open.reporter).filter((group) => !overruled.has(group)));
      if (reporters.size >= COMMUNITY_LIMITS.autoHideReports) {
        await ctx.db.patch(recipe._id, { underReview: true });
        await syncRecipe(ctx, recipe._id);
      }
    }
    if (emailSettings()) await ctx.scheduler.runAfter(0, internal.reports.notify, { reportId });
    return ok({ success: true });
  },
});

// ── Moderator queue ────────────────────────────────────────────────────

async function toReport(ctx: QueryCtx, report: Doc<'hubReports'>, cache: AuthorCache): Promise<Report> {
  const fallback = (id: Id<'users'>) => ({ id: id as string, name: DEFAULT_DISPLAY_NAME });
  const recipe = await ctx.db.get(report.recipeId);
  const result: Report = {
    id: report._id,
    status: report.status,
    createdAt: new Date(report._creationTime).toISOString(),
    reason: report.reason,
    reportCount: (await openReportsOn(ctx, report)).length,
    recipe: recipe && {
      id: recipe._id,
      title: recipe.snapshot.title,
      author: (await authorOf(ctx, recipe.userId, cache)) ?? fallback(recipe.userId),
      visibility: recipe.visibility,
      underReview: !!recipe.underReview,
    },
  };
  if (report.note) result.note = report.note;
  const tip = report.tipId && (await ctx.db.get(report.tipId));
  if (tip) {
    result.tip = { id: tip._id, author: (await authorOf(ctx, tip.userId, cache)) ?? fallback(tip.userId), rating: tip.rating };
    if (tip.tip) result.tip.tip = tip.tip;
  }
  if (report.resolution) result.resolution = report.resolution;
  if (report.resolvedAt) result.resolvedAt = new Date(report.resolvedAt).toISOString();
  return result;
}

/** POST /api/v2/mod/reports, newest first. */
export const modReports = internalQuery({
  args: { userId: v.id('users'), status: reportStatusValidator, paginationOpts: paginationOptsValidator },
  returns: v.any(),
  handler: async (ctx, { userId, status, paginationOpts }): Promise<Result<{ reports: Report[]; cursor: string | null }>> => {
    if (!(await isModerator(ctx, userId))) return fail(403, 'Moderators only');
    const page = await ctx.db.query('hubReports').withIndex('by_status', (q) => q.eq('status', status)).order('desc').paginate(paginationOpts);
    const cache: AuthorCache = new Map();
    const reports: Report[] = [];
    for (const report of page.page) reports.push(await toReport(ctx, report, cache));
    return ok({ reports, cursor: page.isDone ? null : page.continueCursor });
  },
});

const RESOLUTIONS = { dismiss: 'Dismissed', remove_recipe: 'Recipe removed', remove_tip: 'Tip removed', ban_user: 'Author banned' } as const;

/** POST /api/v2/mod/resolve: acts on a report and closes every open report on the same target. */
export const modResolve = internalMutation({
  args: {
    userId: v.id('users'), reportId: v.string(), reason: v.optional(v.string()),
    action: v.union(v.literal('dismiss'), v.literal('remove_recipe'), v.literal('remove_tip'), v.literal('ban_user')),
  },
  returns: v.any(),
  handler: async (ctx, { userId, action, ...args }): Promise<Result<{ success: true }>> => {
    if (!(await isModerator(ctx, userId))) return fail(403, 'Moderators only');
    const reportId = ctx.db.normalizeId('hubReports', args.reportId);
    const report = reportId && (await ctx.db.get(reportId));
    if (!report) return fail(404, 'Not found');
    if (report.status !== 'open') return fail(400, 'This report is already resolved');
    const reason = args.reason?.trim().slice(0, 200) || undefined;
    const recipe = await ctx.db.get(report.recipeId);
    const tip = report.tipId ? await ctx.db.get(report.tipId) : null;

    if (action === 'dismiss') {
      if (!report.tipId && recipe?.underReview) {
        await ctx.db.patch(recipe._id, { underReview: undefined });
        await syncRecipe(ctx, recipe._id);
      }
    } else if (action === 'remove_recipe') {
      if (recipe) await removeRecipe(ctx, recipe._id, reason ?? `Reported: ${REPORT_REASON_LABELS[report.reason]}`);
    } else if (action === 'remove_tip') {
      if (!report.tipId) return fail(400, "This report isn't about a tip");
      if (tip) await hideMade(ctx, tip);
    } else {
      // The author of what was reported: the tip's for a tip report, else the recipe's.
      const target = report.tipId ? tip?.userId : recipe?.userId;
      if (!target || !(await ctx.db.get(target))) return fail(404, 'That account no longer exists');
      if (target === userId) return fail(400, "You can't ban yourself");
      await banCook(ctx, target, reason ?? REPORT_REASON_LABELS[report.reason]);
    }

    const now = Date.now();
    const resolution = reason ? `${RESOLUTIONS[action]}: ${reason}`.slice(0, 200) : RESOLUTIONS[action];
    for (const open of await openReportsOn(ctx, report)) {
      await ctx.db.patch(open._id, { status: action === 'dismiss' ? 'dismissed' : 'actioned', resolution, resolvedAt: now, resolvedBy: userId });
    }
    return ok({ success: true });
  },
});

// ── Email ──────────────────────────────────────────────────────────────

export const summary = internalQuery({
  args: { reportId: v.id('hubReports') },
  returns: v.any(),
  handler: async (ctx, { reportId }) => {
    const report = await ctx.db.get(reportId);
    if (!report) return null;
    const recipe = await ctx.db.get(report.recipeId);
    const tip = report.tipId ? await ctx.db.get(report.tipId) : null;
    return {
      reason: REPORT_REASON_LABELS[report.reason],
      note: report.note ?? null,
      recipeId: report.recipeId,
      title: recipe?.snapshot.title ?? null,
      authorId: recipe?.userId ?? null,
      underReview: !!recipe?.underReview,
      link: shareUrlOf(report.recipeId) ?? null,
      tip: tip ? { id: tip._id, authorId: tip.userId, text: tip.tip ?? null } : null,
      openReports: (await openReportsOn(ctx, report)).length,
    };
  },
});

/** Emails a new report to `MODERATION_EMAIL`. Failures are logged and never reach the reporter. */
export const notify = internalAction({
  args: { reportId: v.id('hubReports') },
  returns: v.null(),
  handler: async (ctx, { reportId }) => {
    const settings = emailSettings();
    if (!settings) return null;
    try {
      const report: {
        reason: string; note: string | null; recipeId: string; title: string | null; authorId: string | null; underReview: boolean;
        link: string | null; tip: { id: string; authorId: string; text: string | null } | null; openReports: number;
      } | null = await ctx.runQuery(internal.reports.summary, { reportId });
      if (!report) return null;
      const lines = [
        `A ${report.tip ? 'tip' : 'recipe'} was reported: ${report.reason}.`,
        '',
        `Recipe: ${report.title ?? '(deleted)'}`,
        `Recipe ID: ${report.recipeId}`,
        ...(report.authorId ? [`Recipe author ID: ${report.authorId}`] : []),
        ...(report.link ? [`Link: ${report.link}`] : []),
        ...(report.tip ? [`Tip ID: ${report.tip.id}`, `Tip author ID: ${report.tip.authorId}`, `Tip: ${report.tip.text ?? '(rating only)'}`] : []),
        ...(report.note ? [`Reporter's note: ${report.note}`] : []),
        `Open reports on this ${report.tip ? 'tip' : 'recipe'}: ${report.openReports}`,
        ...(report.underReview ? ['The recipe is hidden until a moderator resolves its reports.'] : []),
        '',
        'Resolve it from the moderation queue in Sous Chef.',
      ];
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${settings.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: settings.from,
          to: settings.to,
          subject: `Community report: ${(report.title ?? 'deleted recipe').slice(0, 80)}`,
          text: lines.join('\n'),
        }),
      });
      if (!response.ok) console.error(`Report email failed: ${response.status}`);
    } catch (error) {
      console.error('Report email failed:', error instanceof Error ? error.message : 'unknown error');
    }
    return null;
  },
});
