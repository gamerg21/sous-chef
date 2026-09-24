import { unitLabel } from '@/lib/units'
import { useRef } from 'react'
import { ArrowLeft, BookmarkPlus, Clock, Copy, ExternalLink, Heart, ImagePlus, ListChecks, ListOrdered, Share2, Trash2, User, Users } from 'lucide-react'
import { buttonClassName, cardClassName, eyebrowClassName, headingFont, IconBadge, rowsClassName, Section } from '@/components/ui/kit'
import type { CommunityRecipe } from './types'
import { cx, formatMinutes } from './utils'

export interface CommunityRecipeDetailViewProps {
  recipe: CommunityRecipe
  onBack?: () => void
  onSaveToLibrary?: (id: string) => void
  onLike?: (id: string) => void
  onShare?: (id: string) => void
  /** Optional: allow “upload” in Design OS preview, though in real community this is author-only */
  onUploadPhoto?: (id: string, file: File) => void
  onRemovePhoto?: (id: string) => void
}

function formatSharedDate(value?: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Read-only sibling of the local RecipeDetailView for a published community recipe. */
export function CommunityRecipeDetailView(props: CommunityRecipeDetailViewProps) {
  const { recipe, onBack, onSaveToLibrary, onLike, onShare, onUploadPhoto, onRemovePhoto } = props
  const fileRef = useRef<HTMLInputElement | null>(null)
  const total = recipe.ingredients.length
  const sharedOn = formatSharedDate(recipe.createdAt)

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
          <button type="button" onClick={() => fileRef.current?.click()} className={recipe.photoUrl ? photoButton : buttonClassName('secondary')}>
            <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
            {recipe.photoUrl ? 'Change photo' : 'Upload photo'}
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
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Back to community
          </button>
          {!recipe.photoUrl && photoControls}
        </div>

        {recipe.photoUrl && (
          <div className="relative aspect-[16/7] overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-900">
            {/* eslint-disable-next-line @next/next/no-img-element -- data or local file URL; next/image adds nothing here */}
            <img src={recipe.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            {photoControls && <div className="absolute right-3 top-3">{photoControls}</div>}
          </div>
        )}

        <header className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className={cx(eyebrowClassName, 'mb-1')}>Shared by {recipe.author?.name ?? 'Unknown'}</p>
              <h1 className="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100" style={headingFont}>
                {recipe.title}
              </h1>
              {recipe.description && <p className="mt-2 max-w-2xl text-base text-stone-600 dark:text-stone-400">{recipe.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {onLike && (
                <button type="button" onClick={() => onLike(recipe.id)} className={buttonClassName('secondary')}>
                  <Heart className="h-4 w-4" strokeWidth={1.75} />
                  Like
                </button>
              )}
              {onShare && (
                <button type="button" onClick={() => onShare(recipe.id)} className={buttonClassName('secondary')}>
                  <Share2 className="h-4 w-4" strokeWidth={1.75} />
                  Share
                </button>
              )}
              <button type="button" onClick={() => onSaveToLibrary?.(recipe.id)} className={cx(buttonClassName('primary'), 'px-5')}>
                <BookmarkPlus className="h-4 w-4" strokeWidth={2} />
                Save to Library
              </button>
            </div>
          </div>

          {/* Quick facts */}
          <div className={cx(cardClassName, 'grid grid-cols-2 overflow-hidden sm:grid-cols-4')}>
            {[
              { icon: Clock, label: 'Time', value: formatMinutes(recipe.totalTimeMinutes) },
              { icon: Users, label: 'Serves', value: recipe.servings ? `${recipe.servings}` : '—' },
              { icon: ListChecks, label: 'Ingredients', value: `${total}` },
              { icon: ListOrdered, label: 'Steps', value: `${recipe.steps.length}` },
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

          {((recipe.tags?.length ?? 0) > 0 || recipe.sourceUrl) && (
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
            <Section title="Ingredients" aside={total > 0 ? `${total} item${total === 1 ? '' : 's'}` : undefined}>
              <div className={cx(cardClassName, 'overflow-hidden')}>
                {total === 0 ? (
                  <p className="p-5 text-sm text-stone-500">No ingredients listed.</p>
                ) : (
                  <ul className="stagger divide-y divide-stone-100 dark:divide-stone-800">
                    {recipe.ingredients.map((ing) => {
                      const amount = [typeof ing.quantity === 'number' ? `${ing.quantity}` : '', unitLabel(ing.unit, ing.quantity)].filter(Boolean).join(' ')
                      return (
                        <li key={ing.id} className="flex items-center gap-3 px-4 py-3">
                          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500/70" />
                          <div className="min-w-0 flex-1">
                            <div className="text-base text-stone-900 dark:text-stone-100">
                              {amount && <span className="font-semibold tabular-nums">{amount} </span>}
                              {ing.name}
                            </div>
                            {ing.note && <div className="text-sm italic text-stone-500 dark:text-stone-400">{ing.note}</div>}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </Section>

            <Section title="Steps">
              <div className={cx(cardClassName, 'overflow-hidden')}>
                {recipe.steps.length === 0 ? (
                  <p className="p-5 text-sm text-stone-500">No steps listed.</p>
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
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="From the community">
              <div className={cx(cardClassName, rowsClassName)}>
                <div className="flex items-center gap-3 p-4">
                  <IconBadge icon={User} tone="success" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{recipe.author?.name ?? 'Unknown'}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">{sharedOn ? `Shared ${sharedOn}` : 'Community author'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <IconBadge icon={Copy} tone="neutral" />
                  <p className="min-w-0 text-sm text-stone-600 dark:text-stone-400">
                    Saving makes an independent copy in your private library. It won’t change if the author edits this recipe later.
                  </p>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
