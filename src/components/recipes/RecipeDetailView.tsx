'use client'

import { unitLabel } from '@/lib/units'
import { useRef } from 'react'
import { ArrowLeft, ChefHat, Clock, ExternalLink, ImagePlus, ListChecks, Pencil, Play, Share2, Star, Trash2, Users } from 'lucide-react'
import { RecipeNutritionCard } from './RecipeNutritionCard'
import { eyebrowClassName } from './IngredientComposer'
import type { PantrySnapshotItem, Recipe } from './types'
import { cx, formatMinutes, ingredientMatchStatus } from './utils'

export interface RecipeDetailViewProps {
  recipe: Recipe
  pantrySnapshot?: PantrySnapshotItem[]
  onBack?: () => void
  onCook?: (id: string) => void
  onPublish?: (id:string) => void
  onEdit?: (id: string) => void
  onToggleFavorite?: (id: string) => void
  onUploadPhoto?: (id: string, file: File) => void
  onRemovePhoto?: (id: string) => void
}

export function RecipeDetailView(props: RecipeDetailViewProps) {
  const { recipe, pantrySnapshot = [], onBack, onCook, onEdit, onPublish, onToggleFavorite, onUploadPhoto, onRemovePhoto } = props
  const fileRef = useRef<HTMLInputElement | null>(null)
  const statuses = recipe.ingredients.map((ing) => ingredientMatchStatus(ing, pantrySnapshot))
  const inStock = statuses.filter((s) => s === 'in-stock').length
  const total = recipe.ingredients.length
  const ready = total > 0 && inStock === total

  const secondaryButton =
    'inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900'
  const photoButton =
    'inline-flex min-h-9 items-center gap-2 rounded-full bg-white/85 px-3 text-sm font-medium text-stone-800 backdrop-blur hover:bg-white dark:bg-black/40 dark:text-stone-100 dark:hover:bg-black/60'

  const photoControls = (onUploadPhoto || onRemovePhoto) && (
    <div className="flex items-center gap-2">
      {recipe.photoUrl && onRemovePhoto && (
        <button type="button" onClick={() => onRemovePhoto(recipe.id)} className={photoButton}>
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          Remove
        </button>
      )}
      {onUploadPhoto && (
        <>
          <button type="button" onClick={() => fileRef.current?.click()} className={recipe.photoUrl ? photoButton : secondaryButton}>
            <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
            {recipe.photoUrl ? 'Change photo' : 'Add photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              onUploadPhoto(recipe.id, f)
              e.currentTarget.value = ''
            }}
          />
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Recipes
            </button>
            {!recipe.photoUrl && photoControls}
          </div>

          {recipe.photoUrl && (
            <div className="relative aspect-[16/7] overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-900">
              <img src={recipe.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <div className="absolute right-3 top-3">{photoControls}</div>
            </div>
          )}

          {/* Title and actions */}
          <header className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100" style={{ fontFamily: 'var(--font-heading)' }}>
                  {recipe.title}
                </h1>
                {recipe.description && <p className="mt-2 max-w-2xl text-base text-stone-600 dark:text-stone-400">{recipe.description}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleFavorite?.(recipe.id)}
                  aria-pressed={!!recipe.favorited}
                  aria-label={recipe.favorited ? 'Remove from favorites' : 'Add to favorites'}
                  className={cx(secondaryButton, 'w-10 justify-center px-0')}
                >
                  <Star className={cx('h-4 w-4', recipe.favorited && 'text-amber-500')} fill={recipe.favorited ? 'currentColor' : 'none'} strokeWidth={1.75} />
                </button>
                {onPublish && (
                  <button type="button" onClick={() => onPublish(recipe.id)} className={secondaryButton}>
                    <Share2 className="h-4 w-4" strokeWidth={1.75} />
                    Share
                  </button>
                )}
                <button type="button" onClick={() => onEdit?.(recipe.id)} className={secondaryButton}>
                  <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onCook?.(recipe.id)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-700"
                >
                  <Play className="h-4 w-4" strokeWidth={2} fill="currentColor" />
                  Cook
                </button>
              </div>
            </div>

            {/* Quick facts */}
            <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-stone-200 bg-white sm:grid-cols-4 dark:border-stone-800 dark:bg-stone-900/40">
              {[
                { icon: Clock, label: 'Time', value: formatMinutes(recipe.totalTimeMinutes) },
                { icon: Users, label: 'Serves', value: recipe.servings ? `${recipe.servings}` : '—' },
                { icon: ListChecks, label: 'Ingredients', value: `${total}` },
                { icon: ChefHat, label: 'In your kitchen', value: total ? `${inStock} of ${total}` : '—' },
              ].map(({ icon: Icon, label, value }, index) => (
                <div
                  key={label}
                  className={cx(
                    'flex items-center gap-3 border-stone-200 p-4 dark:border-stone-800',
                    index % 2 === 0 && 'border-r',
                    index < 2 && 'border-b sm:border-b-0',
                    index === 1 && 'sm:border-r',
                    index === 2 && 'sm:border-r'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
                  <div className="min-w-0">
                    <div className={eyebrowClassName}>{label}</div>
                    <div className="mt-0.5 truncate text-base font-semibold text-stone-900 dark:text-stone-100">{value}</div>
                  </div>
                </div>
              ))}
            </div>

            {(recipe.tags?.length || recipe.sourceUrl) && (
              <div className="flex flex-wrap items-center gap-2">
                {recipe.tags?.map((t) => (
                  <span key={t} className="rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                    {t}
                  </span>
                ))}
                {recipe.sourceUrl && (
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-stone-200 px-3 py-1 text-sm text-stone-700 hover:bg-stone-100 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
                  >
                    Source <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </a>
                )}
              </div>
            )}
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className={eyebrowClassName}>Ingredients</h2>
                  {total > 0 && (
                    <span className={cx('text-xs font-medium', ready ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500 dark:text-stone-400')}>
                      {ready ? 'Everything’s in your kitchen' : `${total - inStock} to get`}
                    </span>
                  )}
                </div>
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/40">
                  {total > 0 && (
                    <div className="h-1 bg-stone-100 dark:bg-stone-800" aria-hidden="true">
                      <div className="h-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(inStock / total) * 100}%` }} />
                    </div>
                  )}
                  {total === 0 ? (
                    <p className="p-5 text-sm text-stone-500">No ingredients yet.</p>
                  ) : (
                    <ul className="stagger divide-y divide-stone-100 dark:divide-stone-800">
                      {recipe.ingredients.map((ing, index) => {
                        const s = statuses[index]
                        const amount = [typeof ing.quantity === 'number' ? `${ing.quantity}` : '', unitLabel(ing.unit, ing.quantity)].filter(Boolean).join(' ')
                        return (
                          <li key={ing.id} className="flex items-center gap-3 px-4 py-3">
                            <span
                              aria-hidden="true"
                              className={cx(
                                'h-2.5 w-2.5 shrink-0 rounded-full',
                                s === 'in-stock' ? 'bg-emerald-500' : s === 'missing' ? 'bg-amber-500' : 'bg-stone-300 dark:bg-stone-600'
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-base text-stone-900 dark:text-stone-100">
                                {amount && <span className="font-semibold tabular-nums">{amount} </span>}
                                {ing.name}
                              </div>
                              {ing.note && <div className="text-sm italic text-stone-500 dark:text-stone-400">{ing.note}</div>}
                            </div>
                            <span
                              className={cx(
                                'shrink-0 text-xs font-medium',
                                s === 'in-stock' ? 'text-emerald-700 dark:text-emerald-400' : s === 'missing' ? 'text-amber-700 dark:text-amber-300' : 'text-stone-400'
                              )}
                            >
                              {s === 'in-stock' ? 'In stock' : s === 'missing' ? 'Need to buy' : 'Not linked'}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </section>

              <section>
                <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Steps</h2>
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/40">
                  {recipe.steps.length === 0 ? (
                    <p className="p-5 text-sm text-stone-500">No steps yet.</p>
                  ) : (
                    <ol className="divide-y divide-stone-100 dark:divide-stone-800">
                      {recipe.steps.map((st, idx) => (
                        <li key={st.id} className="flex gap-4 px-5 py-4">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                            {idx + 1}
                          </span>
                          <p className="pt-1 text-base leading-relaxed text-stone-800 dark:text-stone-200">{st.text}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <RecipeNutritionCard recipe={recipe} pantry={pantrySnapshot} />
              {recipe.notes && (
                <section>
                  <h2 className={cx(eyebrowClassName, 'mb-2 px-1')}>Notes</h2>
                  <p className="whitespace-pre-wrap rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-700 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-300">
                    {recipe.notes}
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
