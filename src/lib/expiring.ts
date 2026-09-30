/**
 * "Expiring soon" rules shared by the inventory card, the "Use it up" cooking
 * filter. Dates are calendar days (YYYY-MM-DD), so
 * "today" is always the cook's local day rather than a UTC instant.
 * The iOS app mirrors these rules in ios/Shared/ExpiringFood.swift.
 */
import type { CookingPlan } from './cooking-plan'

export const DEFAULT_EXPIRING_WITHIN_DAYS = 3
export const EXPIRING_WINDOW_CHOICES = [1, 2, 3, 5, 7] as const
export const MAX_EXPIRING_WITHIN_DAYS = 30

export type ExpiringCandidate = { id: string; name: string; quantity?: number; expiresOn?: string }
export type Expiring<T extends ExpiringCandidate> = T & { daysLeft: number }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/** A valid window in days, falling back to the default for anything odd. */
export function expiringWindow(days?: number | null): number {
  return typeof days === 'number' && Number.isInteger(days) && days >= 0 && days <= MAX_EXPIRING_WITHIN_DAYS ? days : DEFAULT_EXPIRING_WITHIN_DAYS
}

/** The calendar day of `date` in `timeZone` (the runtime's zone when omitted or unknown). */
export function localDay(date = new Date(), timeZone?: string | null): string {
  const format = (zone?: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  if (timeZone) {
    try { return format(timeZone) } catch { /* Unknown zone: use the server's. */ }
  }
  return format()
}

/** Whole days from `from` to `to`, both YYYY-MM-DD; null for anything unparseable. */
export function daysBetween(from: string, to: string): number | null {
  const a = DAY.exec(from), b = DAY.exec(to)
  if (!a || !b) return null
  const ms = Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null
}

/**
 * Items in stock that expire within `withinDays` of `today`, including
 * anything already past its date. Soonest first, then by name.
 */
export function findExpiring<T extends ExpiringCandidate>(items: T[], options: { today: string; withinDays?: number }): Expiring<T>[] {
  const within = expiringWindow(options.withinDays)
  const found: Expiring<T>[] = []
  for (const item of items) {
    if (!item.expiresOn || !((item.quantity ?? 0) > 0)) continue
    const daysLeft = daysBetween(options.today, item.expiresOn.slice(0, 10))
    if (daysLeft !== null && daysLeft <= within) found.push({ ...item, daysLeft })
  }
  return found.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name))
}

/** "expires today", "expire in 2 days", "expired yesterday"… */
export function expiryPhrase(daysLeft: number, plural = false): string {
  const verb = plural ? 'expire' : 'expires'
  if (daysLeft < -1) return `expired ${-daysLeft} days ago`
  if (daysLeft === -1) return 'expired yesterday'
  if (daysLeft === 0) return `${verb} today`
  if (daysLeft === 1) return `${verb} tomorrow`
  return `${verb} in ${daysLeft} days`
}

function joinNames(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * One line for a reminder: "Milk and spinach expire in 2 days", or with mixed
 * dates "Milk expires today; spinach expires in 2 days (+2 more)". Names up to
 * `limit`; returns an empty string when nothing is expiring.
 */
export function summarizeExpiring(items: { name: string; daysLeft: number }[], limit = 3): string {
  const sorted = [...items].sort((a, b) => a.daysLeft - b.daysLeft)
  const shown = sorted.slice(0, limit)
  const groups: { daysLeft: number; names: string[] }[] = []
  for (const item of shown) {
    const last = groups[groups.length - 1]
    if (last?.daysLeft === item.daysLeft) last.names.push(item.name)
    else groups.push({ daysLeft: item.daysLeft, names: [item.name] })
  }
  const text = groups.map(group => `${joinNames(group.names)} ${expiryPhrase(group.daysLeft, group.names.length > 1)}`).join('; ')
  const more = sorted.length - shown.length
  const line = more > 0 ? `${text} (+${more} more)` : text
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/**
 * The expiring pantry rows a recipe draws on, according to its cooking plan:
 * rows it would deduct plus rows its unmeasured ingredients match.
 */
export function expiringUsedBy<T extends ExpiringCandidate>(plan: Pick<CookingPlan, 'deductions' | 'uses'> | undefined, expiring: Expiring<T>[]): Expiring<T>[] {
  if (!plan) return []
  const ids = new Set([...plan.deductions.map(item => item.id), ...(plan.uses ?? [])])
  return expiring.filter(item => ids.has(item.id))
}

/**
 * Recipes that use at least one expiring item, most expiring items first,
 * soonest expiry next, then the existing readiness order (`byReadiness`).
 */
export function rankByExpiring<R, T extends ExpiringCandidate>(recipes: R[], usesOf: (recipe: R) => Expiring<T>[], byReadiness: (a: R, b: R) => number): R[] {
  const scored = recipes.map(recipe => ({ recipe, uses: usesOf(recipe) })).filter(entry => entry.uses.length > 0)
  const soonest = (uses: Expiring<T>[]) => Math.min(...uses.map(item => item.daysLeft))
  return scored
    .sort((a, b) => b.uses.length - a.uses.length || soonest(a.uses) - soonest(b.uses) || byReadiness(a.recipe, b.recipe))
    .map(entry => entry.recipe)
}
