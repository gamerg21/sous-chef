'use client'

import { useState } from 'react'
import { Barcode, Loader2, PackageCheck, PackageX, ScanBarcode } from 'lucide-react'
import { IconBadge, Pill, Section, buttonClassName, cardClassName, cx, eyebrowClassName, fieldClassName, rowsClassName } from '@/components/ui/kit'
import Link from 'next/link'
import { useQuery, useMutation, useAction } from '@/lib/kitchen/client'
import { api } from '@/lib/kitchen/api'
import type { BarcodeLookupResult } from '@/server/kitchen/barcodes'

export default function OpenFoodFactsSettings() {
  const settings = useQuery(api.barcodes.settings, {})
  const configure = useMutation(api.barcodes.configure)
  const lookup = useAction(api.barcodes.lookup)
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<BarcodeLookupResult | null>(null)
  const busy = saving || !settings?.canManage || !settings?.serverEnabled

  return (
    <Section title="Food data" id="open-food-facts-title">
      <div className={cx(cardClassName, rowsClassName)}>
        <div className="flex items-start gap-3 p-4">
          <IconBadge icon={Barcode} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">Open Food Facts</h3>
              <Pill tone={!settings ? 'neutral' : settings.effectiveEnabled ? 'success' : 'neutral'}>
                {!settings ? 'Loading…' : settings.effectiveEnabled ? 'Enabled' : 'Disabled'}
              </Pill>
            </div>
            <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">Fill in product details and nutrition when you scan or enter a barcode. No account or API key needed.</p>
          </div>
        </div>

        {settings && (
          <div className="flex min-h-14 items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">Online lookups for this household</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {!settings.serverEnabled
                  ? 'The server operator has disabled online Open Food Facts lookups.'
                  : !settings.canManage
                    ? 'Only household owners and admins can change this setting.'
                    : 'Lookups send the barcode to Open Food Facts. Saved results stay available offline.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-label="Enable Open Food Facts for this household"
              disabled={busy}
              onClick={async () => {
                setSaving(true); setError(''); setResult(null)
                try { await configure({ enabled: !settings.enabled }) }
                catch (error) { setError(error instanceof Error ? error.message : 'Could not save the integration.') }
                finally { setSaving(false) }
              }}
              className={cx(
                'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
                settings.enabled ? 'bg-emerald-600' : 'bg-stone-300 dark:bg-stone-700'
              )}
            >
              <span
                aria-hidden="true"
                className={cx('absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200', settings.enabled && 'translate-x-5')}
              />
            </button>
          </div>
        )}

        <form
          className="space-y-2 p-4"
          onSubmit={async event => {
            event.preventDefault(); setSearching(true); setError(''); setResult(null)
            try { setResult(await lookup({ code: code.trim() })) }
            catch { setError('Could not look up this barcode. The service may be unavailable or busy. Try again in a minute.') }
            finally { setSearching(false) }
          }}
        >
          <label htmlFor="integration-barcode" className={eyebrowClassName}>Try a barcode</label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
              <input id="integration-barcode" value={code} onChange={event => { setCode(event.target.value); setResult(null) }} inputMode="numeric" pattern="[0-9]{8,14}" minLength={8} maxLength={14} required placeholder="8–14 digit barcode" className={cx(fieldClassName, 'pl-9 tabular-nums')} />
            </div>
            <button className={buttonClassName('soft')} disabled={searching || !settings} type="submit">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {searching ? 'Looking up…' : 'Look up'}
            </button>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">Preview only. To add a product, use the barcode scanner in <Link href="/inventory" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">Kitchen Inventory</Link>.</p>

          {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
          {result && (
            <div role="status" className="animate-fade-in mt-3 flex items-start gap-3 rounded-xl bg-stone-50 p-3 text-sm dark:bg-stone-900">
              <IconBadge icon={result.found ? PackageCheck : PackageX} tone={result.found ? 'success' : 'neutral'} size="sm" />
              <div className="min-w-0">
                {result.found ? <>
                  <p className="font-medium text-stone-900 dark:text-stone-100">{result.prefill.name}</p>
                  <p className="text-stone-600 dark:text-stone-400">{result.prefill.barcode}{result.prefill.category ? ` · ${result.prefill.category}` : ''}</p>
                  {result.stale && <p className="mt-1 text-amber-700 dark:text-amber-300">Showing saved details; online data was not refreshed.</p>}
                  {result.attribution && <a href={result.attribution.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-stone-500 underline">Open Food Facts · ODbL</a>}
                </> : <p className="text-stone-600 dark:text-stone-400">{settings?.effectiveEnabled ? 'No product found. You can enter its details manually in your inventory.' : 'No saved product found. Enable online lookups to search Open Food Facts.'}</p>}
              </div>
            </div>
          )}
        </form>
      </div>
    </Section>
  )
}
