import { Bookmark, ChefHat, Clock, Star, User } from 'lucide-react'
import { cardClassName, headingFont, Pill } from '@/components/ui/kit'
import type { CommunityRecipeListing } from './types'
import { clampRating, cx, formatCompactNumber, formatMinutes } from './utils'

export interface CommunityRecipeCardProps {
  recipe: CommunityRecipeListing
  onOpen?: (id: string) => void
  onSave?: (id: string) => void
}

export function CommunityRecipeCard({ recipe, onOpen, onSave }: CommunityRecipeCardProps) {
  const rating = clampRating(recipe.rating)

  return (
    <article className={cx(cardClassName, 'lift relative flex flex-col overflow-hidden')}>
      <button type="button" onClick={() => onOpen?.(recipe.id)} className="flex flex-1 flex-col text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600">
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-emerald-50 to-stone-100 dark:from-emerald-950/40 dark:to-stone-900">
          {recipe.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data or local file URL; next/image adds nothing here
            <img src={recipe.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <ChefHat aria-hidden="true" className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-emerald-600/40 dark:text-emerald-400/30" strokeWidth={1.5} />
          )}
          {recipe.visibility === 'unlisted' && (
            <Pill className="absolute left-3 top-3 bg-white/90 backdrop-blur dark:bg-black/50">Unlisted</Pill>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-stone-900 dark:text-stone-100" style={headingFont}>
            {recipe.title}
          </h3>
          {recipe.description && <p className="mt-1 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{recipe.description}</p>}

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-stone-500 dark:text-stone-400">
            <span className="inline-flex min-w-0 items-center gap-1">
              <User className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">{recipe.authorName}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {formatMinutes(recipe.totalTimeMinutes)}
            </span>
            {rating > 0 && (
              <span className="inline-flex items-center gap-1" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
                <Star className="h-3.5 w-3.5 text-amber-500" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                <span className="tabular-nums">{rating.toFixed(1)}</span>
              </span>
            )}
            <span className="tabular-nums">{formatCompactNumber(recipe.saves ?? 0)} saves</span>
          </div>

          {(recipe.tags?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {recipe.tags!.slice(0, 3).map((t) => (
                <span key={t} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  {t}
                </span>
              ))}
              {recipe.tags!.length > 3 && <span className="px-1 text-xs text-stone-500">+{recipe.tags!.length - 3}</span>}
            </div>
          )}
        </div>
      </button>

      <button
        type="button"
        onClick={() => onSave?.(recipe.id)}
        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur hover:bg-white hover:text-emerald-700 dark:bg-black/50 dark:text-stone-100 dark:hover:bg-black/70"
        aria-label="Save recipe"
        title="Save"
      >
        <Bookmark className="h-4 w-4" strokeWidth={1.75} />
      </button>
    </article>
  )
}
