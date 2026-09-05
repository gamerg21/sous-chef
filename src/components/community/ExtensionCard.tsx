import { BadgeCheck, Star } from 'lucide-react'
import type { ExtensionListing, ExtensionPricing } from './types'
import { clampRating, cx, formatPricing } from './utils'

export interface ExtensionCardProps {
  extension: ExtensionListing
  installed?: boolean
  onOpen?: (id: string) => void
}

function Stars({ value }: { value: number }) {
  const full = Math.round(clampRating(value))
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => {
        const active = i < full
        return (
          <Star
            key={i}
            className={cx('w-3.5 h-3.5', active ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600')}
            fill={active ? 'currentColor' : 'none'}
            strokeWidth={1.75}
          />
        )
      })}
    </span>
  )
}

function pricingPill(p: ExtensionPricing) {
  if (p === 'free') return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
  if (p === 'trial') return 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
  return 'bg-stone-100 text-stone-800 dark:bg-stone-900/60 dark:text-stone-200'
}

/**
 * Catalog preview card. Listings have no adapters yet, so the card offers
 * details only; there is deliberately no Install or Enable control.
 */
export function ExtensionCard({ extension, installed, onOpen }: ExtensionCardProps) {
  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen?.(extension.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-medium text-stone-900 dark:text-stone-100 truncate">{extension.name}</h3>
            {extension.author.verified && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-lime-100 dark:bg-lime-950/40 text-lime-900 dark:text-lime-200">
                <BadgeCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400 line-clamp-2">{extension.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
            <span className={cx('text-[11px] font-medium px-2 py-1 rounded-full', pricingPill(extension.pricing))}>
              {formatPricing(extension.pricing)}
            </span>
            {typeof extension.rating === 'number' && extension.rating > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                <Stars value={extension.rating} />
                <span className="tabular-nums">{extension.rating.toFixed(1)}</span>
              </span>
            ) : null}
            <span className="text-stone-500 dark:text-stone-500">{extension.category}</span>
          </div>
        </button>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-200">
            {installed ? 'Listed for this kitchen' : 'Not available yet'}
          </span>
        </div>
      </div>

      {(extension.tags?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {extension.tags!.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-1 text-stone-700 dark:text-stone-200"
            >
              {t}
            </span>
          ))}
          {extension.tags && extension.tags.length > 4 && (
            <span className="text-stone-500 dark:text-stone-500">+{extension.tags.length - 4}</span>
          )}
        </div>
      )}
    </div>
  )
}
