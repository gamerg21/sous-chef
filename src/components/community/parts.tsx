'use client'
// Small pieces shared by the community screens.
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChefHat, CloudOff, Heart, Star, TriangleAlert, UserRoundPlus, UserRoundCheck, Link2 } from 'lucide-react'
import { buttonClassName, cardClassName, cx, EmptyState } from '@/components/ui/kit'
import { describeProblem, safePhotoUrl } from './feed-logic'

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600'
export const textLinkClassName = cx('rounded font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400', focusRing)

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx('-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100', focusRing)}>
      <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {children}
    </Link>
  )
}

/**
 * A remote recipe photo in a box whose size is set by the caller, so nothing
 * moves when it loads. Only https URLs are loaded; a missing or broken photo
 * shows the placeholder.
 */
export function RecipePhoto({ url, className, iconClassName = 'h-9 w-9', eager }: { url?: string; className?: string; iconClassName?: string; eager?: boolean }) {
  const src = safePhotoUrl(url)
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br from-emerald-50 to-stone-100 dark:from-emerald-950/40 dark:to-stone-900', className)}>
      {src && failed !== src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote community photo; the origin isn't known at build time
        <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(src)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <ChefHat aria-hidden="true" className={cx('absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-emerald-600/40 dark:text-emerald-400/30', iconClassName)} strokeWidth={1.5} />
      )}
    </div>
  )
}

/** Read-only stars, e.g. on a tip. */
export function Stars({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <span role="img" aria-label={`${filled} out of 5 stars`} className={cx('inline-flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={cx('h-3.5 w-3.5', n <= filled ? 'text-amber-500' : 'text-stone-300 dark:text-stone-700')} fill="currentColor" strokeWidth={0} />
      ))}
    </span>
  )
}

/** Average rating with its count: "4.5 (12)". */
export function RatingSummary({ rating, count, className }: { rating?: number; count: number; className?: string }) {
  if (rating === undefined || count <= 0) return null
  return (
    <span className={cx('inline-flex items-center gap-1 tabular-nums', className)}>
      <Star aria-hidden="true" className="h-3.5 w-3.5 text-amber-500" fill="currentColor" strokeWidth={0} />
      <span aria-hidden="true">{rating.toFixed(1)}</span>
      <span className="sr-only">{`Rated ${rating.toFixed(1)} out of 5 by ${count} ${count === 1 ? 'cook' : 'cooks'}`}</span>
    </span>
  )
}

/**
 * Heart toggle with its count. While a request is in flight it stays focusable
 * (aria-disabled, not disabled) so keyboard focus isn't lost.
 */
export function LikeButton({ liked, count, pending, onToggle, label, size = 'sm', className }: { liked: boolean; count: number; pending: boolean; onToggle: () => void; label: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-disabled={pending || undefined}
      aria-label={`${label}, ${count} ${count === 1 ? 'like' : 'likes'}`}
      onClick={() => { if (!pending) onToggle() }}
      className={cx(
        size === 'md' ? buttonClassName('secondary') : cx('inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs hover:bg-stone-100 dark:hover:bg-stone-800', focusRing),
        'tabular-nums aria-disabled:cursor-default aria-disabled:opacity-70',
        liked ? 'text-rose-600 dark:text-rose-400' : size === 'sm' && 'text-stone-500 dark:text-stone-400',
        className
      )}
    >
      <Heart aria-hidden="true" className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={1.75} fill={liked ? 'currentColor' : 'none'} />
      {size === 'md' && <span>{liked ? 'Liked' : 'Like'}</span>}
      <span>{count}</span>
    </button>
  )
}

/** Follow toggle. Fixed width so the label change doesn't move its neighbours. */
export function FollowButton({ following, pending, onToggle, name, className }: { following: boolean; pending: boolean; onToggle: () => void; name: string; className?: string }) {
  const Icon = following ? UserRoundCheck : UserRoundPlus
  return (
    <button
      type="button"
      aria-pressed={following}
      aria-disabled={pending || undefined}
      aria-label={`Follow ${name}`}
      onClick={() => { if (!pending) onToggle() }}
      className={cx(buttonClassName(following ? 'soft' : 'secondary', 'sm'), 'min-w-[7.25rem] aria-disabled:cursor-default aria-disabled:opacity-70', className)}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {following ? 'Following' : 'Follow'}
    </button>
  )
}

/** A failed read, as a card: what happened and what to do next. */
export function ProblemState({ error, onRetry, retrying }: { error: unknown; onRetry?: () => void; retrying?: boolean }) {
  const problem = describeProblem(error)
  const icon = problem.kind === 'unreachable' ? CloudOff : problem.kind === 'not_connected' || problem.kind === 'reconnect' ? Link2 : TriangleAlert
  return (
    <div className={cardClassName} role="status">
      <EmptyState
        icon={icon}
        title={problem.title}
        description={problem.message}
        action={
          problem.action || (problem.retry && onRetry) ? (
            <div className="flex flex-wrap justify-center gap-2">
              {problem.action && (
                <Link href={problem.action.href} className={buttonClassName('primary')}>
                  {problem.action.label}
                </Link>
              )}
              {problem.retry && onRetry && (
                <button type="button" onClick={onRetry} disabled={retrying} className={buttonClassName('secondary')}>
                  {retrying ? 'Trying…' : 'Try again'}
                </button>
              )}
            </div>
          ) : undefined
        }
      />
    </div>
  )
}

/** The community service isn't set up or didn't answer. */
export function UnavailableState({ onRetry, retrying }: { onRetry?: () => void; retrying?: boolean }) {
  return (
    <div className={cardClassName} role="status">
      <EmptyState
        icon={CloudOff}
        title="Community unavailable"
        description="The community service isn't connected or didn't answer. Your own recipes and pantry are unaffected."
        action={
          onRetry && (
            <button type="button" onClick={onRetry} disabled={retrying} className={buttonClassName('secondary')}>
              {retrying ? 'Trying…' : 'Try again'}
            </button>
          )
        }
      />
    </div>
  )
}

export const recipeGridClassName = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

/** Placeholder cards with the same proportions as real ones. */
export function RecipeGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading recipes…</span>
      <div className={recipeGridClassName} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className={cx(cardClassName, 'overflow-hidden')}>
            <div className="skeleton aspect-[16/10] w-full !rounded-none" />
            <div className="space-y-2.5 p-4">
              <div className="skeleton h-5 w-3/4" />
              <div className="skeleton h-3.5 w-1/2" />
              <div className="skeleton h-3.5 w-full" />
              <div className="skeleton mt-4 h-6 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Placeholder rows inside a card. */
export function RowsSkeleton({ rows = 3, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className={cx(cardClassName, 'space-y-3 p-4')}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton h-12 w-full" aria-hidden="true" />
      ))}
    </div>
  )
}
