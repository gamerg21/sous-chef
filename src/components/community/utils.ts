export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function formatMinutes(total?: number): string {
  if (!total || total <= 0) return '—'
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function formatCompactNumber(n: number | undefined | null): string {
  if (!Number.isFinite(n as number)) return '—'
  const value = n as number
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`
  return `${value}`
}

export function formatPricing(p: 'free' | 'paid' | 'trial' | undefined): string {
  if (!p) return '—'
  if (p === 'free') return 'Free'
  if (p === 'paid') return 'Paid'
  return 'Trial'
}

export function clampRating(rating: number | undefined): number {
  if (!Number.isFinite(rating as number)) return 0
  return Math.max(0, Math.min(5, rating as number))
}


