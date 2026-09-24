import { ChefHat, Clock, MoreHorizontal, Star, Users } from 'lucide-react'
import type { PantrySnapshotItem, Recipe } from './types'
import { cx, formatMinutes, recipeMatchSummary } from './utils'
import { cardClassName, headingFont, iconButtonClassName, Pill, type Tone } from '@/components/ui/kit'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface RecipeCardProps {
  recipe: Recipe
  pantrySnapshot?: PantrySnapshotItem[]
  onOpen?: (id: string) => void
  onEdit?: (id: string) => void
  onToggleFavorite?: (id: string) => void
  onDelete?: (id: string) => void
}

export function RecipeCard(props: RecipeCardProps) {
  const { recipe, pantrySnapshot, onOpen, onEdit, onToggleFavorite, onDelete } = props
  const summary = recipeMatchSummary(recipe, pantrySnapshot ?? [])

  const status: { label: string; tone: Tone } =
    summary.missing > 0
      ? { label: `${summary.missing} missing`, tone: 'warning' }
      : summary.unmapped > 0
        ? { label: `${summary.unmapped} unmapped`, tone: 'neutral' }
        : { label: 'Ready', tone: 'success' }

  return (
    <div className={cx(cardClassName, 'lift flex gap-3 p-3 sm:p-4')}>
      <button type="button" onClick={() => onOpen?.(recipe.id)} className="flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
        {recipe.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local upload or data URL, not a static asset
          <img src={recipe.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20" />
        ) : (
          <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 sm:h-20 sm:w-20 dark:bg-emerald-950/40 dark:text-emerald-400">
            <ChefHat className="h-6 w-6" strokeWidth={1.5} />
          </span>
        )}
        <span className="block min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>
              {recipe.title}
            </h3>
            {recipe.favorited && <Star className="h-4 w-4 shrink-0 text-amber-500" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />}
          </span>
          {recipe.description && <span className="mt-0.5 line-clamp-2 block text-sm text-stone-600 dark:text-stone-400">{recipe.description}</span>}
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500 dark:text-stone-400">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {formatMinutes(recipe.totalTimeMinutes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {recipe.servings ?? '—'}
            </span>
            <Pill tone={status.tone}>{status.label}</Pill>
            {recipe.tags?.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600 dark:bg-stone-800/70 dark:text-stone-300">
                {t}
              </span>
            ))}
            {recipe.tags && recipe.tags.length > 3 && <span>+{recipe.tags.length - 3}</span>}
          </span>
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cx(iconButtonClassName, '-mr-1 -mt-1')} aria-label="More actions">
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit?.(recipe.id)}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onToggleFavorite?.(recipe.id)}>{recipe.favorited ? 'Unfavorite' : 'Favorite'}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(recipe.id)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
