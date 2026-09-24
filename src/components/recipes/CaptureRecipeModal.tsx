'use client'
import { unitLabel } from '@/lib/units'
import { useMemo, useRef, useState } from 'react'
import { useAction } from '@/lib/kitchen/client'
import { api } from '@/lib/kitchen/api'
import { Modal } from '../ui/modal'
import { analyzeRecipeText } from '@/lib/recipe-capture'
import type { Recipe } from './types'
import { ClipboardPaste, Link2 } from 'lucide-react'
import { buttonClassName, cx, eyebrowClassName, fieldClassName, headingFont, heroCardClassName, rowsClassName, SegmentedControl, StatusDot } from '../ui/kit'

const input = cx(fieldClassName, 'mt-1.5')
const textarea = 'mt-1.5 w-full rounded-xl border border-stone-200 bg-white p-3 text-base leading-relaxed text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100'
const primary = cx(buttonClassName('primary'), 'min-h-11 w-full')

function formatAmount(quantity?: number, unit?: string) {
  if (quantity == null) return ''
  const rounded = Math.round(quantity * 100) / 100
  return `${rounded}${unit && unit !== 'each' ? ` ${unitLabel(unit, rounded)}` : ''}`
}

function Summary({ recipe, warnings }: { recipe: Recipe; warnings: string[] }) {
  return <div className={cx(heroCardClassName, 'animate-fade-in overflow-hidden text-sm')} aria-live="polite">
    <div className="px-4 pt-4 pb-3">
      <span className={eyebrowClassName}>Preview</span>
      <p className="mt-1 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>{recipe.title || 'Untitled recipe'}</p>
      <p className="mt-0.5 text-stone-600 dark:text-stone-400">{recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'} · {recipe.steps.length} step{recipe.steps.length === 1 ? '' : 's'}{recipe.servings ? ` · serves ${recipe.servings}` : ''}{recipe.totalTimeMinutes ? ` · ${recipe.totalTimeMinutes} min` : ''}</p>
    </div>
    {recipe.ingredients.length > 0 && <ul className={cx(rowsClassName, 'border-t border-stone-200 text-stone-700 dark:border-stone-800 dark:text-stone-300')}>
      {recipe.ingredients.slice(0, 6).map(item => {
        const unparsed = item.quantity == null && /\d/.test(item.name)
        return <li key={item.id} className={cx('flex items-center gap-3 px-4 py-2', unparsed && 'text-amber-700 dark:text-amber-400')}>
          <StatusDot tone={unparsed ? 'warning' : 'success'} />
          <span className="min-w-0"><span className="font-medium tabular-nums">{formatAmount(item.quantity, item.unit)}</span>{item.quantity != null && ' '}{item.name}{item.note && <span className="text-stone-500"> ({item.note})</span>}</span>
        </li>
      })}
      {recipe.ingredients.length > 6 && <li className="px-4 py-2 text-stone-500">…and {recipe.ingredients.length - 6} more</li>}
    </ul>}
    {warnings.length > 0 && <ul className="list-disc space-y-0.5 border-t border-amber-200 bg-amber-50 py-3 pr-4 pl-9 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
  </div>
}

export function CaptureRecipeModal({ onClose, onCapture }: { onClose: () => void; onCapture: (recipe: Recipe) => void }) {
  const importFromUrl = useAction(api.recipeImport.fromUrl)
  const [mode, setMode] = useState<'link' | 'paste'>('link')
  const [link, setLink] = useState('')
  const [text, setText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<{ recipe: Recipe; warnings: string[] } | null>(null)
  const pending = useRef(false)

  const analysis = useMemo(() => {
    if (!text.trim()) return null
    try { return analyzeRecipeText(text, /^https?:\/\/\S+$/i.test(sourceUrl.trim()) ? sourceUrl : undefined) }
    catch (error) { return { error: error instanceof Error ? error.message : 'Check the recipe text.' } }
  }, [text, sourceUrl])

  const finish = (recipe: Recipe) => { onCapture(recipe); onClose() }
  const switchTo = (next: 'link' | 'paste') => { setMode(next); setError(''); setImported(null) }

  return <Modal isOpen onClose={() => { if (!pending.current) onClose() }} title="Import a recipe" className="max-w-2xl">
    <div className="space-y-4">
      <SegmentedControl
        label="Import method"
        value={mode}
        onChange={value => { if (!busy) switchTo(value) }}
        options={[{ value: 'link', label: 'From a link', icon: Link2 }, { value: 'paste', label: 'Paste text', icon: ClipboardPaste }]}
      />

      {mode === 'link' ? imported ? <div className="space-y-4">
        <Summary recipe={imported.recipe} warnings={imported.warnings} />
        <button type="button" autoFocus className={primary} onClick={() => finish(imported.recipe)}>Review draft</button>
      </div> : <form className="space-y-4" onSubmit={async event => {
        event.preventDefault()
        if (pending.current || !link.trim()) return
        pending.current = true; setBusy(true); setError('')
        try {
          const result = await importFromUrl({ url: link.trim() })
          // Clean structured imports go straight to the editor; anything uncertain is shown first.
          if (result.method === 'structured' && !result.warnings.length) finish(result.recipe)
          else setImported(result)
        } catch (error) { setError(error instanceof Error ? error.message : 'Could not import that recipe.') }
        finally { pending.current = false; setBusy(false) }
      }}>
        <p className="text-sm text-stone-600 dark:text-stone-400">Paste the link to a recipe page. Sous Chef reads the title, ingredients, steps, servings, and nutrition the site publishes, then opens an editable draft. Nothing is saved until you press Save.</p>
        <label className="block"><span className={eyebrowClassName}>Recipe link</span><input autoFocus type="url" inputMode="url" required disabled={busy} value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.example.com/best-pancakes" className={input} /></label>
        {error && <div role="alert" className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"><p className="break-words">{error}</p>
          <button type="button" className="font-medium text-emerald-700 underline dark:text-emerald-300" onClick={() => { setSourceUrl(link.trim()); switchTo('paste') }}>Paste the recipe text instead</button></div>}
        <button disabled={busy || !link.trim()} className={primary}>{busy ? 'Reading the recipe…' : 'Import recipe'}</button>
        <p className="text-xs text-stone-500 dark:text-stone-400">Sous Chef fetches the page from your kitchen server. The draft replaces any unsaved changes in the editor.</p>
      </form> : <form className="space-y-4" onSubmit={event => {
        event.preventDefault()
        if (analysis && 'recipe' in analysis) finish(analysis.recipe)
      }}>
        <p className="text-sm text-stone-600 dark:text-stone-400">Paste a recipe from a webpage, a message, or your notes. Headings like “Ingredients” and “Instructions” help, but they’re optional — check the preview below.</p>
        <label className="block"><span className={eyebrowClassName}>Recipe text</span><textarea autoFocus required maxLength={50000} rows={10} value={text} onChange={e => {
          const value = e.target.value
          if (/^\s*https?:\/\/\S+\s*$/i.test(value) && !text) { setLink(value.trim()); switchTo('link'); return }
          setText(value)
        }} placeholder={'Pancakes\n\nIngredients\n1 1/2 cups flour\n2 eggs\n250 ml milk\n\nInstructions\nMix the ingredients.\nCook in a lightly oiled pan.'} className={textarea} /></label>
        <label className="block"><span className={eyebrowClassName}>Source link (optional)</span><input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" className={input} /></label>
        {analysis && ('error' in analysis ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{analysis.error}</p> : <Summary recipe={analysis.recipe} warnings={analysis.warnings} />)}
        <button disabled={!analysis || 'error' in analysis} className={primary}>Review draft</button>
        <p className="text-xs text-stone-500 dark:text-stone-400">The draft replaces any unsaved changes in the editor. Your original text is kept in the recipe notes.</p>
      </form>}
    </div>
  </Modal>
}
