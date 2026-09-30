/**
 * Daily "use it up" email. See docs/EXPIRY_REMINDERS.md.
 *
 * A timer in the single Node process checks every 15 minutes. Each person
 * who opted in gets at most one digest per local day, on the first check at
 * or after DIGEST_HOUR in their timezone. The day is claimed in SQLite before
 * sending, so restarts and overlapping checks never send twice; a failed send
 * releases the claim so a later check retries. Nothing is sent when nothing
 * is expiring, when email isn't configured, or in the demo.
 */
import { getDatabase, type KitchenDatabase } from './database';
import { context } from './execute';
import { getCurrentHouseholdId } from './helpers';
import { emailConfigured, sendEmail, type Email } from './email';
import { DIGEST_HOUR, expiryPhrase, expiringWindow, findExpiring, localDay, summarizeExpiring } from '../../lib/expiring';
import type { Id } from './_generated/dataModel';


const CHECK_EVERY_MS = 15 * 60 * 1000;

type Env = Record<string, string | undefined>;
type Options = { database?: KitchenDatabase; now?: Date; env?: Env; send?: (email: Email) => Promise<void> };

function localHour(date: Date, timeZone?: string): number {
  const format = (zone?: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(date));
  if (timeZone) {
    try { return format(timeZone); } catch { /* Unknown zone: use the server's. */ }
  }
  return format();
}

export function digestEmail(to: string, name: string | undefined, items: { name: string; daysLeft: number; location?: string }[], appUrl: string): Email {
  const link = (path: string) => new URL(path, appUrl).toString();
  const summary = summarizeExpiring(items);
  const lines = items.map((item) => `- ${item.name}${item.location ? ` (${item.location})` : ''}: ${expiryPhrase(item.daysLeft)}`);
  return {
    to,
    subject: items.length === 1 ? `Use it up: ${summary}` : `Use it up: ${items.length} items expiring soon`,
    text: [
      `Hi${name ? ` ${name}` : ''},`,
      '',
      `${summary}.`,
      '',
      ...lines,
      '',
      `Recipes that use them: ${link('/cooking?filter=expiring')}`,
      `Your inventory: ${link('/inventory?filter=expiring')}`,
      '',
      `You're getting this because you turned on the daily expiry email. Turn it off in Settings, Account & preferences: ${link('/settings/account')}`,
    ].join('\n'),
  };
}

/** Sends today's digests that are due. Returns how many were sent. */
export async function runExpiryDigest(options: Options = {}): Promise<number> {
  const env = options.env ?? process.env;
  if (!emailConfigured(env)) return 0;
  const database = options.database ?? getDatabase();
  const now = options.now ?? new Date();
  const send = options.send ?? ((email: Email) => sendEmail(email, env));

  const subscribers = await database.transaction(async (db) =>
    db.query('userPreferences').withIndex('by_expiryDigestEmail', (q) => q.eq('expiryDigestEmail', true)).collect(), false);

  let sent = 0;
  for (const subscriber of subscribers) {
    const timeZone = subscriber.timezone;
    if (localHour(now, timeZone) < DIGEST_HOUR) continue;
    const today = localDay(now, timeZone);

    // Claim today and build the message in one transaction.
    const claim = await database.transaction(async (db) => {
      const prefs = await db.get(subscriber._id);
      if (!prefs?.expiryDigestEmail || prefs.expiryDigestHandledOn === today) return null;
      const user = await db.get(prefs.userId);
      if (!user?.email || user.demoExpiresAt) return null;
      const previous = prefs.expiryDigestHandledOn;
      await db.patch(prefs._id, { expiryDigestHandledOn: today });

      const householdId = await getCurrentHouseholdId(context(database, prefs.userId, db), prefs.userId);
      if (!householdId) return null;
      const rows = await db.query('inventoryItems').withIndex('by_householdId', (q) => q.eq('householdId', householdId)).collect();
      const locations = new Map((await db.query('kitchenLocations').withIndex('by_householdId', (q) => q.eq('householdId', householdId)).collect()).map((row) => [row._id as string, row.name]));
      const stock = await Promise.all(rows.map(async (row) => ({
        id: row._id as string,
        name: (await db.get(row.foodItemId))?.name ?? 'Unknown',
        quantity: row.quantity,
        expiresOn: row.expiresOn,
        location: locations.get(row.locationId),
      })));
      const expiring = findExpiring(stock, { today, withinDays: expiringWindow(prefs.expiringWithinDays) });
      // Nothing expiring: today is handled without an email.
      if (!expiring.length) return null;
      return { prefsId: prefs._id, previous, email: digestEmail(user.email, user.name, expiring, env.APP_URL!) };
    });
    if (!claim) continue;

    try {
      await send(claim.email);
      sent++;
    } catch (error) {
      console.error('Expiry digest email failed; will retry', error instanceof Error ? error.message : error);
      await database.transaction(async (db) => {
        const prefs = await db.get(claim.prefsId as Id<'userPreferences'>);
        if (prefs?.expiryDigestHandledOn === today) await db.patch(prefs._id, { expiryDigestHandledOn: claim.previous });
      });
    }
  }
  return sent;
}

const timers = globalThis as typeof globalThis & { expiryDigestTimer?: ReturnType<typeof setInterval> };

/** Starts the in-process digest timer once. Returns false when email is off or it's already running. */
export function startExpiryDigestScheduler(env: Env = process.env): boolean {
  if (timers.expiryDigestTimer || !emailConfigured(env)) return false;
  const check = () => { runExpiryDigest({ env }).catch((error) => console.error('Expiry digest check failed', error)); };
  timers.expiryDigestTimer = setInterval(check, CHECK_EVERY_MS);
  timers.expiryDigestTimer.unref?.();
  // Catch up shortly after a restart instead of waiting a full interval.
  setTimeout(check, 30_000).unref?.();
  return true;
}
