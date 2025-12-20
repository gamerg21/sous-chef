import { BadgeCheck, Download, ExternalLink, Shield, Star } from 'lucide-react'
import type { ExtensionListing, ExtensionPricing } from './types'
import { clampRating, cx, formatCompactNumber, formatPricing } from './utils'

export interface ExtensionCardProps {
  extension: ExtensionListing
  installed?: boolean
  enabled?: boolean
  needsConfiguration?: boolean
  onOpen?: (id: string) => void
  onInstall?: (id: string) => void
  onToggleEnabled?: (id: string) => void
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

export function ExtensionCard({
  extension,
  installed,
  enabled,
  needsConfiguration,
  onOpen,
  onInstall,
  onToggleEnabled,
}: ExtensionCardProps) {
  const statusPill =
    installed && needsConfiguration
      ? { label: 'Needs setup', cls: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200' }
      : installed
        ? { label: enabled ? 'Enabled' : 'Disabled', cls: enabled ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-200' }
        : null

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
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
              <Stars value={extension.rating ?? 0} />
              <span className="tabular-nums">{(extension.rating ?? 0).toFixed(1)}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
              <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
              {formatCompactNumber(extension.installs)}
            </span>
            <span className="text-stone-500 dark:text-stone-500">•</span>
            <span className="text-stone-500 dark:text-stone-500">{extension.category}</span>
          </div>
        </button>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {statusPill && (
            <span className={cx('text-[11px] font-medium px-2 py-1 rounded-full', statusPill.cls)}>{statusPill.label}</span>
          )}

          {!installed ? (
            <button
              type="button"
              onClick={() => onInstall?.(extension.id)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Install
              <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggleEnabled?.(extension.id)}
              className={cx(
                'inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                enabled
                  ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/30'
                  : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-900/60'
              )}
            >
              <Shield className="w-4 h-4" strokeWidth={1.75} />
              {enabled ? 'Disable' : 'Enable'}
            </button>
          )}
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


