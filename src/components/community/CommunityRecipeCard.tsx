'use client'
import Link from 'next/link'
import { Bookmark, BookmarkCheck, Clock, ShoppingBasket } from 'lucide-react'
import type { LocalListing } from '@/lib/community-contract'
import { cardClassName, cx, headingFont } from '@/components/ui/kit'
import { missingSummary, pantrySummary } from './feed-logic'
import { focusRing, LikeButton, RatingSummary, RecipePhoto, recipeGridClassName } from './parts'
import { useLike } from './useCommunity'
import { formatCompactNumber, formatMinutes } from './utils'

export interface CommunityRecipeCardProps {
  recipe: LocalListing
  likePending: boolean
  onToggleLike: (recipe: LocalListing) => void
  /** Leave the cook's name as plain text, e.g. on that cook's own profile. */
  hideCookLink?: boolean
}

/**
 * One community recipe. The title link covers the whole card; the cook link
 * and the like button sit above it, so each is its own tab stop.
 */
export function CommunityRecipeCard({ recipe, likePending, onToggleLike, hideCookLink }: CommunityRecipeCardProps) {
  const pantry = pantrySummary(recipe.pantry)
  const missing = missingSummary(recipe.pantry)
  const tags = recipe.tags.slice(0, 3)
  return (
    <article className={cx(cardClassName, 'lift relative flex flex-col overflow-hidden')}>
      <RecipePhoto url={recipe.photoUrl} className="aspect-[16/10] w-full" />
      {recipe.saved && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-emerald-800 shadow-sm backdrop-blur dark:bg-black/60 dark:text-emerald-200">
          <BookmarkCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Saved
        </span>
      )}

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 break-words text-lg font-semibold leading-snug text-stone-900 dark:text-stone-100" style={headingFont}>
          <Link
            href={`/community/recipes/${encodeURIComponent(recipe.id)}`}
            className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-emerald-600"
          >
            {recipe.title}
          </Link>
        </h3>

        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
          <span className="min-w-0 truncate">
            by{' '}
            {hideCookLink ? (
              recipe.author.name
            ) : (
              <Link href={`/community/cooks/${encodeURIComponent(recipe.author.id)}`} className={cx('relative z-10 rounded font-medium text-stone-700 underline-offset-2 hover:underline dark:text-stone-300', focusRing)}>
                {recipe.author.name}
              </Link>
            )}
          </span>
          {!!recipe.totalTimeMinutes && recipe.totalTimeMinutes > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {formatMinutes(recipe.totalTimeMinutes)}
            </span>
          )}
        </p>

        {recipe.description && <p className="mt-2 line-clamp-2 break-words text-sm text-stone-600 dark:text-stone-400">{recipe.description}</p>}

        {pantry && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs dark:bg-emerald-950/40">
            <p className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-200">
              <ShoppingBasket className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {pantry}
            </p>
            {missing && <p className="mt-0.5 line-clamp-2 break-words text-stone-600 dark:text-stone-400">{missing}</p>}
          </div>
        )}

        {tags.length > 0 && (
          <ul aria-label="Tags" className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag} className="max-w-full truncate rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700 dark:bg-stone-800/70 dark:text-stone-300">
                {tag}
              </li>
            ))}
            {recipe.tags.length > tags.length && <li className="px-1 py-0.5 text-xs text-stone-500">+{recipe.tags.length - tags.length}</li>}
          </ul>
        )}

        <div className="-mb-1 -ml-2 mt-auto flex items-center gap-2 pt-3 text-xs text-stone-500 dark:text-stone-400">
          <LikeButton liked={recipe.liked === true} count={recipe.likeCount} pending={likePending} onToggle={() => onToggleLike(recipe)} label={`Like ${recipe.title}`} className="relative z-10" />
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Bookmark className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span aria-hidden="true">{formatCompactNumber(recipe.saveCount)}</span>
            <span className="sr-only">{`${recipe.saveCount} ${recipe.saveCount === 1 ? 'save' : 'saves'}`}</span>
          </span>
          <RatingSummary rating={recipe.rating} count={recipe.madeCount} className="ml-1" />
        </div>
      </div>
    </article>
  )
}

/** A responsive grid of cards sharing one like handler. */
export function CommunityRecipeGrid({ recipes, hideCookLink, className }: { recipes: LocalListing[]; hideCookLink?: boolean; className?: string }) {
  const like = useLike()
  return (
    <ul className={cx(recipeGridClassName, className)}>
      {recipes.map((recipe) => (
        <li key={recipe.id} className="flex min-w-0 [&>*]:w-full">
          <CommunityRecipeCard recipe={recipe} likePending={like.pending.has(recipe.id)} onToggleLike={like.toggle} hideCookLink={hideCookLink} />
        </li>
      ))}
    </ul>
  )
}
