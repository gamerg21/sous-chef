import { ArrowLeft, BadgeCheck, Info, KeyRound, Puzzle, Star, Tag, User } from 'lucide-react'
import { buttonClassName, cardClassName, eyebrowClassName, headingFont, IconBadge, PageContainer, Pill, rowsClassName, Section } from '@/components/ui/kit'
import type { ExtensionListing, InstalledExtension } from './types'
import { clampRating, cx, formatPricing } from './utils'

export interface ExtensionDetailViewProps {
  extension: ExtensionListing
  installed?: InstalledExtension | null
  onBack?: () => void
  onRemove?: (id: string) => void
}

/**
 * Catalog preview detail. Shows what a listing declares about itself and
 * states plainly that it cannot be installed yet. A kitchen that still has a
 * listing recorded from earlier data can remove that record.
 */
export function ExtensionDetailView({ extension, installed, onBack, onRemove }: ExtensionDetailViewProps) {
  const isInstalled = Boolean(installed && installed.extensionId === extension.id)
  const rating = clampRating(extension.rating)

  return (
    <PageContainer width="4xl">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        Back to catalog
      </button>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <IconBadge icon={Puzzle} tone="info" size="lg" />
          <div className="min-w-0">
            <p className={cx(eyebrowClassName, 'mb-1')}>{extension.category}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>
                {extension.name}
              </h1>
              {extension.author.verified && (
                <Pill tone="success">
                  <BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  Verified
                </Pill>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-base text-stone-600 dark:text-stone-400">{extension.description}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <Pill tone="neutral">Not available yet</Pill>
          {isInstalled && onRemove ? (
            <button type="button" onClick={() => onRemove(extension.id)} className={cx(buttonClassName('secondary'), 'min-h-11 text-rose-700 dark:text-rose-300')}>
              Remove from this kitchen
            </button>
          ) : null}
        </div>
      </header>

      <div className={cx(cardClassName, 'grid grid-cols-1 overflow-hidden sm:grid-cols-3')}>
        {[
          {
            icon: User,
            label: 'Author',
            value: extension.author.url ? (
              <a href={extension.author.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                {extension.author.name}
              </a>
            ) : (
              extension.author.name
            ),
          },
          { icon: Tag, label: 'Pricing', value: formatPricing(extension.pricing) },
          {
            icon: Star,
            label: 'Rating',
            value: rating > 0 ? <span className="tabular-nums">{rating.toFixed(1)} / 5</span> : '—',
          },
        ].map(({ icon: Icon, label, value }, index) => (
          <div key={label} className={cx('flex items-center gap-3 border-stone-200 p-4 dark:border-stone-800', index < 2 && 'border-b sm:border-b-0 sm:border-r')}>
            <Icon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0">
              <div className={eyebrowClassName}>{label}</div>
              <div className="mt-0.5 truncate text-base font-semibold text-stone-900 dark:text-stone-100">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <IconBadge icon={Info} tone="warning" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">Catalog preview</h2>
          <p className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">
            This listing describes a planned extension. Sous Chef does not ship an adapter for it, so it cannot be
            installed and nothing in your kitchen changes because it is listed here.
          </p>
        </div>
      </div>

      <Section title="Declared data access" aside="What it would need once it exists">
        <div className={cx(cardClassName, 'overflow-hidden')}>
          {(extension.permissions?.length ?? 0) > 0 ? (
            <ul className={rowsClassName}>
              {extension.permissions!.map((p) => (
                <li key={p} className="flex items-center gap-3 px-4 py-3 text-sm text-stone-800 dark:text-stone-200">
                  <IconBadge icon={KeyRound} tone="neutral" size="sm" />
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-stone-600 dark:text-stone-400">This listing has not declared any data access.</p>
          )}
        </div>
      </Section>
    </PageContainer>
  )
}
