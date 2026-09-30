import { unitLabel } from '@/lib/units'
import { DEFAULT_EXPIRING_WITHIN_DAYS, daysBetween, localDay } from '@/lib/expiring'
import type { InventoryItem, QuantityUnit } from './types'

export function formatQuantity(quantity: number, unit: QuantityUnit): string {
  if (unit === 'count') return `${quantity}`
  // Avoid trailing .0 for common decimal inputs
  const q = Number.isInteger(quantity) ? `${quantity}` : `${quantity}`
  return `${q} ${unitLabel(unit, quantity)}`
}

export function parseISODate(value?: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(value?: string, format = 'YYYY-MM-DD'): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value

  switch (format) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`
    case 'YYYY-MM-DD':
    default:
      return value
  }
}

export function daysUntil(date: Date, now = new Date()): number {
  const ms = date.getTime() - now.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

/** Calendar-day status in the cook's local time; "soon" uses their expiring window. */
export function itemExpiryStatus(item: InventoryItem, now = new Date(), withinDays = DEFAULT_EXPIRING_WITHIN_DAYS): 'none' | 'expired' | 'soon' | 'ok' {
  const days = item.expiresOn ? daysBetween(localDay(now), item.expiresOn.slice(0, 10)) : null
  if (days === null) return 'none'
  if (days < 0) return 'expired'
  if (days <= withinDays) return 'soon'
  return 'ok'
}
