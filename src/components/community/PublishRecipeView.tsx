import { useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChefHat, Globe, Lock, Plus, ShieldCheck, X } from 'lucide-react'
import {
  bareInputClassName,
  buttonClassName,
  cardClassName,
  eyebrowClassName,
  headingFont,
  heroCardClassName,
  heroInputClassName,
  IconBadge,
  optionClassName,
  PageContainer,
  PageHeader,
  Pill,
  rowsClassName,
  Section,
} from '@/components/ui/kit'
import type { CommunityRecipeListing } from './types'
import { cx } from './utils'

export interface PublishRecipeViewProps {
  draft?: Partial<CommunityRecipeListing> | null
  /** Status banners (connection, current publication) shown under the header. */
  notice?: ReactNode
  onBack?: () => void
  onPublish?: (next: { title: string; description?: string; tags: string[]; visibility: 'public' | 'unlisted' }) => void
}

const visibilityOptions = [
  { value: 'public', icon: Globe, label: 'Public', hint: 'Discoverable in search and recommended lists.' },
  { value: 'unlisted', icon: Lock, label: 'Unlisted', hint: 'Only people with the link can view it.' },
] as const

export function PublishRecipeView({ draft, notice, onBack, onPublish }: PublishRecipeViewProps) {
  const [title, setTitle] = useState(draft?.title ?? 'My Best Weeknight Pasta')
  const [description, setDescription] = useState(
    draft?.description ?? 'A fast, flexible base recipe — works with almost any veg and pantry sauce.'
  )
  const [tags, setTags] = useState<string[]>(draft?.tags ?? ['Weeknight', 'One-pan'])
  const [tagInput, setTagInput] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>(draft?.visibility ?? 'public')

  const preview = useMemo(
    () => ({
      title: title.trim() || 'Untitled recipe',
      description: description.trim() || undefined,
      tags: tags.filter(Boolean).slice(0, 6),
      visibility,
    }),
    [title, description, tags, visibility]
  )

  const addTag = () => {
    const next = tagInput.trim()
    if (!next) return
    setTags((prev) => (prev.includes(next) ? prev : [...prev, next]))
    setTagInput('')
  }

  return (
    <PageContainer width="5xl">
      <PageHeader
        back={
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Back
          </button>
        }
        eyebrow="Share with the community"
        title="Publish recipe"
        description="Upload a copy to the connected recipe community. Public recipes appear in search; unlisted recipes are reachable only by link. Your pantry and private notes stay local."
      />

      {notice}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Section title="Listing">
            <div className={cx(heroCardClassName, rowsClassName)}>
              <div className="px-4 py-4">
                <label htmlFor="publish-title" className={eyebrowClassName}>
                  Title
                </label>
                <input
                  id="publish-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={cx(heroInputClassName, 'mt-1')}
                  style={headingFont}
                  placeholder="Recipe title"
                />
              </div>
              <div className="px-4 py-4">
                <label htmlFor="publish-description" className={eyebrowClassName}>
                  Description
                </label>
                <textarea
                  id="publish-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={cx(bareInputClassName, 'mt-1 min-h-20 resize-y leading-relaxed')}
                  placeholder="What makes this recipe great?"
                />
              </div>
            </div>
          </Section>

          <Section title="Tags" aside={tags.length > 0 ? `${tags.length} added` : undefined}>
            <div className={cx(cardClassName, rowsClassName)}>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3">
                  {tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-emerald-50 pl-3 pr-2 text-sm text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950"
                      title="Remove tag"
                    >
                      {t}
                      <X className="h-3.5 w-3.5 opacity-60" strokeWidth={2} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 py-1.5 pl-4 pr-1.5">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                  aria-label="Add a tag"
                  className={cx(bareInputClassName, 'min-h-10')}
                  placeholder="Add a tag (e.g. Vegetarian)"
                />
                <button type="button" onClick={addTag} className={buttonClassName('soft', 'sm')}>
                  <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  Add
                </button>
              </div>
            </div>
          </Section>

          <Section title="Visibility">
            <div className={cx(cardClassName, 'space-y-1 p-1.5')} role="radiogroup" aria-label="Visibility">
              {visibilityOptions.map(({ value, icon, label, hint }) => {
                const selected = visibility === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setVisibility(value)}
                    className={cx(optionClassName(selected), 'min-h-14 py-2')}
                  >
                    <IconBadge icon={icon} tone={selected ? 'success' : 'neutral'} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-stone-900 dark:text-stone-100">{label}</span>
                      <span className="block text-xs font-normal text-stone-600 dark:text-stone-400">{hint}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.25} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </Section>

          <div className={cx(cardClassName, 'flex items-start gap-3 p-4')}>
            <IconBadge icon={ShieldCheck} tone="neutral" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-stone-900 dark:text-stone-100">What gets shared</div>
              <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">
                Title, description, tags, servings, time, ingredients, steps, source link, and the recipe photo. Private notes,
                inventory links, and household details stay in your kitchen.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onBack} className={buttonClassName('ghost')}>
              Cancel
            </button>
            <button type="button" onClick={() => onPublish?.(preview)} className={cx(buttonClassName('primary'), 'px-6')}>
              Publish
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6">
            <Section
              title="Listing preview"
              aside={<Pill tone={preview.visibility === 'public' ? 'success' : 'neutral'}>{preview.visibility === 'public' ? 'Public' : 'Unlisted'}</Pill>}
            >
              <div className={cx(cardClassName, 'overflow-hidden')}>
                <div className="relative aspect-[16/10] bg-gradient-to-br from-emerald-50 to-stone-100 dark:from-emerald-950/40 dark:to-stone-900">
                  {draft?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data or local file URL; next/image adds nothing here
                    <img src={draft.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                  <ChefHat aria-hidden="true" className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-emerald-600/40 dark:text-emerald-400/30" strokeWidth={1.5} />
                  )}
                </div>
                <div className="p-4">
                  <div className="text-lg font-semibold leading-snug text-stone-900 dark:text-stone-100" style={headingFont}>
                    {preview.title}
                  </div>
                  {preview.description && <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{preview.description}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {preview.tags.length > 0 ? (
                      preview.tags.map((t) => (
                        <span key={t} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-stone-500">No tags</span>
                    )}
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
