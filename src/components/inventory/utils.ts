import type { InventoryItem, QuantityUnit } from './types'

export function formatQuantity(quantity: number, unit: QuantityUnit): string {
  if (unit === 'count') return `${quantity}`
  // Avoid trailing .0 for common decimal inputs
  const q = Number.isInteger(quantity) ? `${quantity}` : `${quantity}`
  return `${q}${unit}`
}

export function parseISODate(value?: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysUntil(date: Date, now = new Date()): number {
  const ms = date.getTime() - now.getTime()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function itemExpiryStatus(item: InventoryItem, now = new Date()): 'none' | 'expired' | 'soon' | 'ok' {
  const d = parseISODate(item.expiresOn)
  if (!d) return 'none'
  const days = daysUntil(d, now)
  if (days < 0) return 'expired'
  if (days <= 3) return 'soon'
  return 'ok'
}

