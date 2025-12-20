import { BookmarkPlus, Clock, Heart, User } from 'lucide-react'
import type { CommunityRecipe } from './types'
import { cx, formatMinutes } from './utils'

export interface CommunityFeedRecipeCardProps {
  recipe: CommunityRecipe
  onOpen?: (id: string) => void
  onSaveToLibrary?: (id: string) => void
  onLike?: (id: string) => void
}

export function CommunityFeedRecipeCard(props: CommunityFeedRecipeCardProps) {
  const { recipe, onOpen, onSaveToLibrary, onLike } = props

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 overflow-hidden">
      <button type="button" onClick={() => onOpen?.(recipe.id)} className="w-full text-left">
        <div className="flex gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium text-stone-900 dark:text-stone-100 truncate">{recipe.title}</h3>
                {recipe.description && (
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-400 line-clamp-2">{recipe.description}</p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                <Clock className="w-3.5 h-3.5" strokeWidth={1.75} />
                {formatMinutes(recipe.totalTimeMinutes)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200">
                <User className="w-3.5 h-3.5" strokeWidth={1.75} />
                {recipe.author?.name ?? 'Unknown'}
              </span>
              {recipe.tags?.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-1 text-stone-700 dark:text-stone-200"
                >
                  {t}
                </span>
              ))}
              {recipe.tags && recipe.tags.length > 3 && (
                <span className="text-stone-500 dark:text-stone-500">+{recipe.tags.length - 3}</span>
              )}
            </div>
          </div>

          <div className="shrink-0">
            {recipe.photoUrl ? (
              <img
                src={recipe.photoUrl}
                alt=""
                className="h-20 w-28 rounded-md object-cover border border-stone-200 dark:border-stone-800"
              />
            ) : (
              <div className="h-20 w-28 rounded-md bg-stone-100 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800" />
            )}
          </div>
        </div>
      </button>

      <div className="px-4 pb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-stone-600 dark:text-stone-400">
          <span className="inline-flex items-center gap-1">
            <Heart className="w-3.5 h-3.5" strokeWidth={1.75} />
            {recipe.likes ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <BookmarkPlus className="w-3.5 h-3.5" strokeWidth={1.75} />
            {recipe.savedCount ?? 0}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onLike?.(recipe.id)}
            className={cx(
              'inline-flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
              'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100',
              'hover:bg-stone-50 dark:hover:bg-stone-900/60'
            )}
          >
            <Heart className="w-4 h-4" strokeWidth={1.75} />
            Like
          </button>
          <button
            type="button"
            onClick={() => onSaveToLibrary?.(recipe.id)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <BookmarkPlus className="w-4 h-4" strokeWidth={1.75} />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}


