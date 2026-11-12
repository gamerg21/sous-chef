// Server-rendered pieces shared by the public explore pages. Everything from
// the community is rendered as text; photos are https URLs (or, from an API v1
// service, checked data URLs) that the response checks already vetted.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChefHat, Clock, CloudOff, Heart, Star, Users } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { cardClassName, cx, EmptyState, headingFont } from '@/components/ui/kit';
import type { PublicListing } from '@/server/kitchen/communityPublic';
import { countLabel, durationLabel, recipeHref } from './query';

export const GUIDELINES_URL = 'https://souschefkitchen.app/community-guidelines/';

export const textLinkClassName =
  'font-medium text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400';

/** Page frame for the public community pages: brand link, content, footer. */
export function ExploreShell({ children, width = 'wide' }: { children: ReactNode; width?: 'wide' | 'reading' }) {
  return (
    <main className="min-h-dvh bg-stone-50 dark:bg-stone-950">
      <div className={cx('mx-auto space-y-6 px-4 py-6 sm:px-6 sm:py-10', width === 'wide' ? 'max-w-5xl' : 'max-w-3xl')}>
        <Link className="flex min-h-11 w-fit items-center gap-3 rounded-lg font-semibold text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-stone-100" href="/" style={headingFont}>
          <BrandLogo decorative />
          Sous Chef
        </Link>
        {children}
        <footer className="flex flex-wrap gap-x-5 gap-y-1 border-t border-stone-200 pt-5 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
          <Link className={cx(textLinkClassName, 'inline-flex min-h-11 items-center')} href="/community">Open your kitchen to save, rate and publish</Link>
          <a className={cx(textLinkClassName, 'inline-flex min-h-11 items-center')} href={GUIDELINES_URL} rel="noopener">Community guidelines</a>
        </footer>
      </div>
    </main>
  );
}

/** Shown when the community isn't configured or can't be read right now. */
export function CommunityUnavailable() {
  return (
    <div className={cardClassName} role="status">
      <EmptyState icon={CloudOff} title="Community unavailable" description="The recipe community is not connected or can’t be reached right now. Try again in a little while." />
    </div>
  );
}

/** Average "made it" rating as text with a star, e.g. "4.5 (12)". */
export function Rating({ rating, madeCount, className }: { rating?: number; madeCount: number; className?: string }) {
  if (rating === undefined || madeCount === 0) return null;
  return (
    <span className={cx('inline-flex items-center gap-1', className)}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">Rated </span>
      <span className="tabular-nums">{rating.toFixed(1)}</span>
      <span className="sr-only"> out of 5 by </span>
      <span aria-hidden="true">·</span>
      <span>{countLabel(madeCount, 'cook')}</span>
    </span>
  );
}

/** Recipe photo, or a quiet placeholder. Decorative: the title sits beside it. */
export function RecipePhoto({ src, className, eager = false }: { src?: string; className?: string; eager?: boolean }) {
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br from-emerald-50 to-stone-100 dark:from-emerald-950/40 dark:to-stone-900', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote community photo; this server never fetches or resizes it
        <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <ChefHat aria-hidden="true" className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-emerald-600/40 dark:text-emerald-400/30" strokeWidth={1.5} />
      )}
    </div>
  );
}

/** A light card for one listing; the whole card opens the recipe. */
export function RecipeCard({ recipe, showCounts }: { recipe: PublicListing; showCounts: boolean }) {
  const time = durationLabel(recipe.totalTimeMinutes);
  return (
    <article className={cx(cardClassName, 'group relative flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/50 hover:border-emerald-300 dark:hover:border-emerald-800')}>
      <RecipePhoto src={recipe.photoUrl ?? recipe.inlinePhoto} className="aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="text-lg font-semibold leading-snug text-stone-900 dark:text-stone-100" style={headingFont}>
          <Link href={recipeHref(recipe.id)} className="line-clamp-2 break-words outline-none after:absolute after:inset-0 after:content-['']">
            {recipe.title}
          </Link>
        </h3>
        <p className="truncate text-sm text-stone-600 dark:text-stone-400">By {recipe.author.name || 'Community cook'}</p>
        {recipe.description && <p className="line-clamp-2 break-words text-sm text-stone-600 dark:text-stone-400">{recipe.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-stone-600 dark:text-stone-400">
          {time && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />{time}</span>}
          {recipe.servings ? <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />Serves {recipe.servings}</span> : null}
          {showCounts && <Rating rating={recipe.rating} madeCount={recipe.madeCount} />}
          {showCounts && recipe.likeCount > 0 && <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />{countLabel(recipe.likeCount, 'like')}</span>}
        </div>
      </div>
    </article>
  );
}
