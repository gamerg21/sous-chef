import { BadgeCheck, ChevronRight, Puzzle, Star } from 'lucide-react'
import { IconBadge, Pill, type Tone } from '@/components/ui/kit'
import type { ExtensionListing, ExtensionPricing } from './types'
import { clampRating, formatPricing } from './utils'

export interface ExtensionCardProps {
  extension: ExtensionListing
  installed?: boolean
  onOpen?: (id: string) => void
}

function pricingTone(p: ExtensionPricing): Tone {
  if (p === 'free') return 'success'
  if (p === 'trial') return 'warning'
  return 'neutral'
}

/**
 * Catalog preview row, meant to sit inside a divided card. Listings have no
 * adapters yet, so the row offers details only; there is deliberately no
 * Install or Enable control.
 */
export function ExtensionCard({ extension, installed, onOpen }: ExtensionCardProps) {
  const rating = clampRating(extension.rating)

  return (
    <button
      type="button"
      onClick={() => onOpen?.(extension.id)}
      className="flex w-full items-start gap-3 p-4 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/40"
    >
      <IconBadge icon={Puzzle} tone="info" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate font-medium text-stone-900 dark:text-stone-100">{extension.name}</h3>
          {extension.author.verified && (
            <Pill tone="success">
              <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              Verified
            </Pill>
          )}
          <Pill tone="neutral">{installed ? 'Listed for this kitchen' : 'Not available yet'}</Pill>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{extension.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500 dark:text-stone-400">
          <Pill tone={pricingTone(extension.pricing)}>{formatPricing(extension.pricing)}</Pill>
          {rating > 0 ? (
            <span className="inline-flex items-center gap-1" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
              <Star className="h-3.5 w-3.5 text-amber-500" fill="currentColor" strokeWidth={0} aria-hidden="true" />
              <span className="tabular-nums">{rating.toFixed(1)}</span>
            </span>
          ) : null}
          <span>{extension.category}</span>
          {extension.tags?.slice(0, 4).map((t) => (
            <span key={t} className="rounded-full border border-stone-200 px-2 py-0.5 text-stone-600 dark:border-stone-700 dark:text-stone-300">
              {t}
            </span>
          ))}
          {extension.tags && extension.tags.length > 4 && <span>+{extension.tags.length - 4}</span>}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 self-center text-stone-400" strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}
