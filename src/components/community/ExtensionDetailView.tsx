import { useMemo, useState } from 'react'
import { BadgeCheck, ChevronLeft, ExternalLink, Shield, Star } from 'lucide-react'
import type { ExtensionListing, InstalledExtension } from './types'
import { clampRating, cx, formatCompactNumber, formatPricing } from './utils'

export interface ExtensionDetailViewProps {
  extension: ExtensionListing
  installed?: InstalledExtension | null
  allExtensions?: ExtensionListing[]
  onBack?: () => void
  onInstall?: (id: string) => void
  onToggleEnabled?: (id: string) => void
  onSelectExtension?: (id: string) => void
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

export function ExtensionDetailView(props: ExtensionDetailViewProps) {
  const { extension, installed, allExtensions = [], onBack, onInstall, onToggleEnabled, onSelectExtension } = props

  // Local selection fallback for previews
  const [localId, setLocalId] = useState(extension.id)
  const effectiveId = onSelectExtension ? extension.id : localId

  const effective = useMemo(() => {
    if (onSelectExtension) return extension
    return allExtensions.find((e) => e.id === effectiveId) ?? extension
  }, [effectiveId, allExtensions, extension, onSelectExtension])

  const isInstalled = Boolean(installed && installed.extensionId === effective.id)

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to marketplace
            </button>

            {!onSelectExtension && allExtensions.length > 1 && (
              <select
                value={effectiveId}
                onChange={(e) => setLocalId(e.target.value)}
                className="h-10 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                aria-label="Pick an extension"
              >
                {allExtensions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Header */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 truncate">{effective.name}</h1>
                  {effective.author.verified && (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-lime-100 dark:bg-lime-950/40 text-lime-900 dark:text-lime-200">
                      <BadgeCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Verified
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{effective.description}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
                  <span className="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-1 text-stone-700 dark:text-stone-200">
                    {effective.category}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                    <Stars value={effective.rating ?? 0} />
                    <span className="tabular-nums">{(effective.rating ?? 0).toFixed(1)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                    {formatCompactNumber(effective.installs)} installs
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                    {formatPricing(effective.pricing)}
                  </span>
                  {effective.updatedAt && <span className="text-stone-500 dark:text-stone-500">Updated {effective.updatedAt}</span>}
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-stretch gap-2 sm:items-end">
                {!isInstalled ? (
                  <button
                    type="button"
                    onClick={() => onInstall?.(effective.id)}
                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Install
                    <ExternalLink className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onToggleEnabled?.(effective.id)}
                    className={cx(
                      'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                      installed?.enabled
                        ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/30'
                        : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-900/60'
                    )}
                  >
                    <Shield className="w-4 h-4" strokeWidth={1.75} />
                    {installed?.enabled ? 'Disable' : 'Enable'}
                  </button>
                )}
                {isInstalled && installed?.needsConfiguration && (
                  <div className="text-xs text-rose-700 dark:text-rose-300">Needs configuration</div>
                )}
              </div>
            </div>
          </div>

          {/* Permissions */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Permissions & data access</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Extensions can request access to parts of your household data. Review carefully before enabling.
            </p>

            {(effective.permissions?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-2">
                {effective.permissions!.map((p) => (
                  <li
                    key={p}
                    className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 px-3 py-2 text-sm text-stone-800 dark:text-stone-200"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 text-sm text-stone-600 dark:text-stone-400">
                This extension did not declare any permissions in the planning data.
              </div>
            )}
          </div>

          {/* Reviews preview */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Reviews (preview)</h2>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { by: 'Avery', text: 'Setup was fast and the permissions were clear.' },
                { by: 'Jordan', text: 'Great idea—would love more configuration options.' },
              ].map((r) => (
                <div key={r.by} className="rounded-lg border border-stone-200 dark:border-stone-800 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100">{r.by}</div>
                    <Stars value={4.5} />
                  </div>
                  <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


