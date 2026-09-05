import { BadgeCheck, ChevronLeft, Star } from 'lucide-react'
import type { ExtensionListing, InstalledExtension } from './types'
import { clampRating, cx, formatPricing } from './utils'

export interface ExtensionDetailViewProps {
  extension: ExtensionListing
  installed?: InstalledExtension | null
  onBack?: () => void
  onRemove?: (id: string) => void
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
            className={cx('w-4 h-4', active ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600')}
            fill={active ? 'currentColor' : 'none'}
            strokeWidth={1.75}
          />
        )
      })}
    </span>
  )
}

/**
 * Catalog preview detail. Shows what a listing declares about itself and
 * states plainly that it cannot be installed yet. A kitchen that still has a
 * listing recorded from earlier data can remove that record.
 */
export function ExtensionDetailView({ extension, installed, onBack, onRemove }: ExtensionDetailViewProps) {
  const isInstalled = Boolean(installed && installed.extensionId === extension.id)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-2 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to catalog
            </button>
          </div>

          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 truncate">{extension.name}</h1>
                  {extension.author.verified && (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-lime-100 dark:bg-lime-950/40 text-lime-900 dark:text-lime-200">
                      <BadgeCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Verified
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{extension.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
                  <span className="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-1 text-stone-700 dark:text-stone-200">
                    {extension.category}
                  </span>
                  {typeof extension.rating === 'number' && extension.rating > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                      <Stars value={extension.rating} />
                      <span className="tabular-nums">{extension.rating.toFixed(1)}</span>
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                    {formatPricing(extension.pricing)}
                  </span>
                  <span className="text-stone-500 dark:text-stone-500">
                    By{' '}
                    {extension.author.url ? (
                      <a href={extension.author.url} target="_blank" rel="noreferrer" className="underline">
                        {extension.author.name}
                      </a>
                    ) : (
                      extension.author.name
                    )}
                  </span>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-stretch gap-2 sm:items-end">
                <span className="inline-flex items-center justify-center text-[11px] font-medium px-2 py-1 rounded-full bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-200">
                  Not available yet
                </span>
                {isInstalled && onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(extension.id)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
                  >
                    Remove from this kitchen
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-5">
            <h2 className="text-base font-semibold text-amber-950 dark:text-amber-100">Catalog preview</h2>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
              This listing describes a planned extension. Sous Chef does not ship an adapter for it, so it cannot be
              installed and nothing in your kitchen changes because it is listed here.
            </p>
          </div>

          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Declared data access</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              What this listing says it would need from your household data once it exists.
            </p>

            {(extension.permissions?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-2">
                {extension.permissions!.map((p) => (
                  <li
                    key={p}
                    className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 px-3 py-2 text-sm text-stone-800 dark:text-stone-200"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 text-sm text-stone-600 dark:text-stone-400">This listing has not declared any data access.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
