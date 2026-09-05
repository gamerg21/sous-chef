'use client'
import { useState } from 'react'
import { Modal } from '../ui/modal'
import { captureRecipe } from '@/lib/recipe-capture'
import type { Recipe } from './types'

export function CaptureRecipeModal({ onClose, onCapture }: { onClose: () => void; onCapture: (recipe: Recipe) => void }) {
  const [text, setText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [error, setError] = useState('')
  return <Modal isOpen onClose={onClose} title="Paste a recipe" className="max-w-2xl">
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault()
      try { onCapture(captureRecipe(text, sourceUrl)); onClose() }
      catch (error) { setError(error instanceof Error ? error.message : 'Check the recipe text and try again.') }
    }}>
      <p className="text-sm text-stone-600 dark:text-stone-400">Copy a recipe from a webpage or your notes. Use the headings below to separate ingredients and instructions. You’ll review an editable draft before saving.</p>
      <label className="block text-sm font-medium">Recipe text<textarea autoFocus required maxLength={50000} rows={12} value={text} onChange={e => setText(e.target.value)} placeholder={'Pancakes\n\nIngredients\n1 1/2 cups flour\n2 eggs\n250 ml milk\n\nInstructions\nMix the ingredients.\nCook in a lightly oiled pan.'} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-3 text-base dark:border-stone-700 dark:bg-stone-900" /></label>
      <label className="block text-sm font-medium">Source link (optional)<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900" /></label>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button className="min-h-11 w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white">Replace current draft and review</button>
    </form>
  </Modal>
}
