import { BookmarkPlus, ChefHat, Clock, Heart, User } from 'lucide-react'
import { buttonClassName, headingFont } from '@/components/ui/kit'
import type { CommunityRecipe } from './types'
import { cx, formatMinutes } from './utils'

export interface CommunityFeedRecipeCardProps {
  recipe: CommunityRecipe
  onOpen?: (id: string) => void
  onSaveToLibrary?: (id: string) => void
  onLike?: (id: string) => void
}

/** One feed entry, drawn as a divided row; the feed view supplies the surrounding card. */
export function CommunityFeedRecipeCard(props: CommunityFeedRecipeCardProps) {
  const { recipe, onOpen, onSaveToLibrary, onLike } = props

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:pr-4">
      <button
        type="button"
        onClick={() => onOpen?.(recipe.id)}
        className="-m-1 flex min-w-0 flex-1 items-center gap-4 rounded-xl p-1 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/40"
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-emerald-50 to-stone-100 sm:h-24 sm:w-28 dark:from-emerald-950/40 dark:to-stone-900">
          {recipe.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data or local file URL; next/image adds nothing here
            <img src={recipe.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <ChefHat aria-hidden="true" className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-emerald-600/40 dark:text-emerald-400/30" strokeWidth={1.5} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-stone-900 dark:text-stone-100" style={headingFont}>
            {recipe.title}
          </h3>
          {recipe.description && <p className="mt-0.5 line-clamp-2 text-sm text-stone-600 dark:text-stone-400">{recipe.description}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {recipe.author?.name ?? 'Unknown'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {formatMinutes(recipe.totalTimeMinutes)}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Heart className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {recipe.likes ?? 0}
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <BookmarkPlus className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {recipe.savedCount ?? 0}
            </span>
            {recipe.tags?.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                {t}
              </span>
            ))}
            {recipe.tags && recipe.tags.length > 3 && <span>+{recipe.tags.length - 3}</span>}
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
        <button type="button" onClick={() => onLike?.(recipe.id)} className={cx(buttonClassName('secondary'), 'flex-1 sm:flex-none')}>
          <Heart className="h-4 w-4" strokeWidth={1.75} />
          Like
        </button>
        <button type="button" onClick={() => onSaveToLibrary?.(recipe.id)} className={cx(buttonClassName('primary'), 'flex-1 sm:flex-none')}>
          <BookmarkPlus className="h-4 w-4" strokeWidth={1.75} />
          Save
        </button>
      </div>
    </div>
  )
}
