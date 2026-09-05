'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { ConvexError } from 'convex/values'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Modal } from '../ui/modal'
import type { Recipe } from './types'

export function PantryIdeasModal({ onClose, onDraft }: { onClose: () => void; onDraft: (recipe: Recipe) => void }) {
  const settings = useQuery(api.aiProviders.list, {})
  const generate = useAction(api.recipeIdeas.generate)
  const provider = settings?.providers.find(item => item.id === settings.activeProviderId)
  const ready = !!provider?.hasKey && !!provider?.model
  const [preferences, setPreferences] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  return <Modal isOpen onClose={() => { if (!pending.current) onClose() }} title="Recipe idea from your pantry" className="max-w-xl">
    <form className="space-y-4" onSubmit={async event => {
      event.preventDefault()
      if (pending.current || !ready) return
      pending.current = true; setBusy(true); setError('')
      try {
        const result = await generate({ preferences })
        onDraft({ ...result.draft, id: `captured-ai-${Date.now()}`, visibility: 'private', ingredients: result.draft.ingredients.map((ingredient, index) => ({ ...ingredient, id: `ai-ingredient-${index}` })), steps: result.draft.steps.map((step, index) => ({ ...step, id: `ai-step-${index}` })), notes: `AI draft using ${result.provider} / ${result.model}. Review ingredient amounts, food preparation, and dietary requirements before cooking.` })
        onClose()
      } catch (error) { setError(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Could not generate a draft. Check your connection and AI settings, then try again.') }
      finally { pending.current = false; setBusy(false) }
    }}>
      {settings === undefined ? <p>Loading AI settings…</p> : !ready ? <p>Set up a provider key and model in <Link href="/settings/ai" className="text-emerald-700 underline dark:text-emerald-300">AI settings</Link> to generate pantry ideas.</p> : <p className="text-sm text-stone-600 dark:text-stone-400">Generate sends this kitchen’s ingredient names, quantities, units, and your preferences to {provider?.name} ({provider?.model}). Your provider may charge for the request. The result replaces the current unsaved draft. Nothing is saved until you review and press Save.</p>}
      <label className="block text-sm font-medium">What sounds good?<textarea disabled={busy} value={preferences} onChange={e => setPreferences(e.target.value)} rows={4} maxLength={1000} placeholder="e.g. A quick vegetarian dinner for two" className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-3 text-base dark:border-stone-700 dark:bg-stone-900" /></label>
      {error && <p role="alert" className="break-words text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button disabled={!ready || busy} className="min-h-11 w-full rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-50">{busy ? 'Creating your draft…' : 'Generate and review draft'}</button>
    </form>
  </Modal>
}
