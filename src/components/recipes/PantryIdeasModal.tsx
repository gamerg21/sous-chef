'use client'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { ConvexError } from 'convex/values'
import { useAction, useQuery } from "@/lib/kitchen/client"
import { api } from "@/lib/kitchen/api"
import { Modal } from '../ui/modal'
import type { Recipe } from './types'
import { Plug, Sparkles } from 'lucide-react'
import { buttonClassName, cx, eyebrowClassName, heroCardClassName, IconBadge } from '../ui/kit'

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
      } catch (error) { setError(error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Could not generate a draft. Check your connection and Integrations, then try again.') }
      finally { pending.current = false; setBusy(false) }
    }}>
      {settings === undefined ? <div className={cx(heroCardClassName, 'space-y-2 p-4')} aria-busy="true"><span className="sr-only">Loading Integrations…</span><div className="skeleton h-4 w-2/3 rounded" /><div className="skeleton h-4 w-full rounded" /></div>
        : !ready ? <div className={cx(heroCardClassName, 'flex items-start gap-3 p-4 text-sm text-stone-700 dark:text-stone-300')}><IconBadge icon={Plug} tone="warning" /><p className="pt-1.5">Set up a provider key and model in <Link href="/settings/integrations" className="font-medium text-emerald-700 underline dark:text-emerald-300">Integrations</Link> to generate pantry ideas.</p></div>
        : <div className={cx(heroCardClassName, 'flex items-start gap-3 p-4')}><IconBadge icon={Sparkles} /><div className="min-w-0"><span className={eyebrowClassName}>Using {provider?.name}</span><p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Generate sends this kitchen’s ingredient names, quantities, units, and your preferences to {provider?.name} ({provider?.model}). Your provider may charge for the request. The result replaces the current unsaved draft. Nothing is saved until you review and press Save.</p></div></div>}
      <label className="block"><span className={eyebrowClassName}>What sounds good?</span><textarea disabled={busy} value={preferences} onChange={e => setPreferences(e.target.value)} rows={4} maxLength={1000} placeholder="e.g. A quick vegetarian dinner for two" className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white p-3 text-base leading-relaxed text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100" /></label>
      {error && <p role="alert" className="break-words rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
      <button disabled={!ready || busy} className={cx(buttonClassName('primary'), 'min-h-11 w-full')}><Sparkles className="h-4 w-4" strokeWidth={1.75} />{busy ? 'Creating your draft…' : 'Generate and review draft'}</button>
    </form>
  </Modal>
}
