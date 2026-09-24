/**
 * Sous Chef's shared visual language: grouped rounded cards, small uppercase
 * "eyebrow" labels, big borderless hero inputs, emerald selected states, and
 * inline drawers (see ./collapse) rather than popovers. Screens compose these
 * instead of restating the classes.
 */
import type { ComponentType, ReactNode } from 'react'
import { cx } from '../cooking/utils'

export { cx }

/** Small uppercase label above a section, field, or value. */
export const eyebrowClassName = 'block text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400'

/** Standard content card; group related rows inside one card. */
export const cardClassName = 'rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/40'

/** Slightly tinted card for a screen's primary "hero" group. */
export const heroCardClassName = 'rounded-2xl border border-stone-200 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/40'

/** Divided rows inside a card. */
export const rowsClassName = 'divide-y divide-stone-200 dark:divide-stone-800'

/** Boxed text field, for search boxes and standalone inputs. */
export const fieldClassName =
  'h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100'

/** Borderless input that sits inside a card row. */
export const bareInputClassName =
  'w-full min-w-0 bg-transparent text-base text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100'

/** Large borderless title input in the heading font (pair with style={headingFont}). */
export const heroInputClassName =
  'w-full bg-transparent text-xl font-semibold tracking-tight text-stone-900 placeholder:font-medium placeholder:text-stone-400 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-600'

export const headingFont = { fontFamily: 'var(--font-heading)' } as const

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger'

export function buttonClassName(variant: ButtonVariant = 'secondary', size: 'md' | 'sm' = 'md') {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
    size === 'md' ? 'min-h-10 px-4 text-sm' : 'min-h-9 px-3 text-sm',
    variant === 'primary' && 'bg-emerald-600 font-semibold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-700',
    variant === 'secondary' && 'border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900',
    variant === 'ghost' && 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-stone-100',
    variant === 'soft' && 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950',
    variant === 'danger' && 'bg-rose-600 font-semibold text-white hover:bg-rose-700'
  )
}

/** Round icon-only button; always pass an aria-label. */
export const iconButtonClassName =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'

/** Option inside an inline list or grid; selected options get the emerald tint. */
export function optionClassName(selected: boolean) {
  return cx(
    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm',
    selected
      ? 'bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
      : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60'
  )
}

/** Wrapping chip/tag; selected chips are solid emerald. */
export function chipClassName(selected = false) {
  return cx(
    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm',
    selected
      ? 'border-emerald-600 bg-emerald-600 font-medium text-white'
      : 'border-stone-200 text-stone-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40'
  )
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const pillTones: Record<Tone, string> = {
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  danger: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
  neutral: 'bg-stone-100 text-stone-700 dark:bg-stone-800/70 dark:text-stone-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200',
}

export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', pillTones[tone], className)}>{children}</span>
}

const dotTones: Record<Tone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  neutral: 'bg-stone-300 dark:bg-stone-600',
  info: 'bg-sky-500',
}

/** Small status dot at the start of a row. Decorative: pair with visible text. */
export function StatusDot({ tone }: { tone: Tone }) {
  return <span aria-hidden="true" className={cx('h-2.5 w-2.5 shrink-0 rounded-full', dotTones[tone])} />
}

/** Tinted round badge holding an icon, e.g. a location or category. */
export function IconBadge({ icon: Icon, tone = 'success', size = 'md' }: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'sm' ? 'h-7 w-7' : size === 'md' ? 'h-9 w-9' : 'h-12 w-12',
        pillTones[tone]
      )}
    >
      <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} strokeWidth={1.75} />
    </span>
  )
}

/** Page wrapper with consistent padding and width. */
export function PageContainer({ children, width = '5xl', className }: { children: ReactNode; width?: '3xl' | '4xl' | '5xl' | '6xl'; className?: string }) {
  const max = { '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl', '6xl': 'max-w-6xl' }[width]
  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8">
      <div className={cx('mx-auto space-y-6', max, className)}>{children}</div>
    </div>
  )
}

/** Screen title block: optional eyebrow, large heading-font title, description, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: ReactNode
}) {
  return (
    <header className="space-y-3">
      {back}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className={cx(eyebrowClassName, 'mb-1')}>{eyebrow}</p>}
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>
            {title}
          </h1>
          {description && <p className="mt-1.5 max-w-2xl text-base text-stone-600 dark:text-stone-400">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** Eyebrow-labelled group; put a card (or several rows) inside. */
export function Section({
  title,
  aside,
  children,
  className,
  id,
}: {
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section className={className} aria-labelledby={id}>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 id={id} className={eyebrowClassName}>
          {title}
        </h2>
        {aside && <div className="text-xs text-stone-500 dark:text-stone-400">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

/** Friendly empty state inside a card. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && <IconBadge icon={Icon} tone="success" size="lg" />}
      <p className="mt-4 text-base font-semibold text-stone-900 dark:text-stone-100" style={headingFont}>
        {title}
      </p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-600 dark:text-stone-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Pill-shaped single choice, e.g. a filter or a two/three-way toggle. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<{ value: T; label: ReactNode; icon?: ComponentType<{ className?: string; strokeWidth?: number }> }>
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('inline-flex rounded-full bg-stone-100 p-1 dark:bg-stone-800/60', className)}>
      {options.map(({ value: optionValue, label: optionLabel, icon: Icon }) => {
        const selected = optionValue === value
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(optionValue)}
            className={cx(
              'flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors',
              selected ? 'bg-white font-medium text-stone-900 shadow-sm dark:bg-stone-950 dark:text-stone-100' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

/** Big number with a caption, for summary rows ("12 items", "3 expiring"). */
export function Stat({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0 p-4">
      <div className={eyebrowClassName}>{label}</div>
      <div
        className={cx(
          'mt-1 truncate text-2xl font-semibold tabular-nums',
          tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : tone === 'danger' ? 'text-rose-700 dark:text-rose-300' : 'text-stone-900 dark:text-stone-100'
        )}
        style={headingFont}
      >
        {value}
      </div>
    </div>
  )
}
