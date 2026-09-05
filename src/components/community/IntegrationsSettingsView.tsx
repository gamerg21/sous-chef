import { useMemo, useState } from 'react'
import { ArrowLeft, Eye, EyeOff, KeyRound, Sparkles, Wrench } from 'lucide-react'
import type { AiSettings, Integration } from './types'
import { IntegrationRow } from './IntegrationRow'
import { cx } from './utils'

export interface IntegrationsSettingsViewProps {
  ai: AiSettings
  integrations: Integration[]
  onBack?: () => void
  onSelectActiveProvider?: (providerId: string) => void
  onDisconnectIntegration?: (id: string) => void
  onOpenExtensionCatalog?: () => void
  onTestAiConnection?: () => void
  onSaveApiKey?: (providerId: string, key: string, model: string) => Promise<boolean> | boolean | void
}

export function IntegrationsSettingsView(props: IntegrationsSettingsViewProps) {
  const {
    ai,
    integrations,
    onBack,
    onSelectActiveProvider,
    onDisconnectIntegration,
    onOpenExtensionCatalog,
    onTestAiConnection,
    onSaveApiKey,
  } = props

  // Safety check: ensure ai is defined with defaults
  const safeAi = ai || { keyMode: 'bring-your-own' as const, providers: [], activeProviderId: undefined }

  // Local state fallback for previews
  const [localProviderId, setLocalProviderId] = useState<string>(safeAi.activeProviderId ?? safeAi.providers[0]?.id ?? 'openai')
  const [reveal, setReveal] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const effectiveProviderId = onSelectActiveProvider ? (safeAi.activeProviderId ?? localProviderId) : localProviderId

  const provider = useMemo(() => safeAi.providers.find((p) => p.id === effectiveProviderId) ?? safeAi.providers[0], [safeAi.providers, effectiveProviderId])

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">AI settings</h1>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Bring your own provider key for optional pantry recipe drafts. Settings apply to the whole household.
              </p>
            </div>
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Back
              </button>
            ) : null}
          </div>

          {/* AI settings */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                  <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">AI configuration</h2>
                </div>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Self-hosted setup uses BYOK. Enter your API key per provider to control billing and usage.
                </p>
              </div>

              <button
                type="button"
                onClick={onTestAiConnection}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors shrink-0"
              >
                <Wrench className="w-4 h-4" strokeWidth={1.75} />
                Test
              </button>
            </div>

            {/* Provider selection */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-1 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 p-4">
                <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Provider</div>
                <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">Select which AI provider to use.</p>
                <div className="mt-3 space-y-2">
                  {safeAi.providers.map((p) => {
                    const active = p.id === effectiveProviderId
                    const disabled = p.availableByok === false
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (disabled || saving) return
                          setApiKey('')
                          setReveal(false)
                          if (onSelectActiveProvider) onSelectActiveProvider(p.id)
                          else setLocalProviderId(p.id)
                        }}
                        className={cx(
                          'w-full text-left rounded-md px-3 py-2 border transition-colors',
                          disabled
                            ? 'opacity-50 cursor-not-allowed border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950'
                            : active
                              ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20'
                              : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 hover:bg-stone-100/70 dark:hover:bg-stone-950/60'
                        )}
                      >
                        <div className={cx('text-sm font-medium', active ? 'text-emerald-950 dark:text-emerald-200' : 'text-stone-900 dark:text-stone-100')}>
                          {p.name}
                        </div>
                        <div className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">
                          {p.model || 'Choose a model'} · {p.hasKey ? 'Key saved' : 'Needs key'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="lg:col-span-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Selected provider</div>
                    <div className="mt-1 text-xs text-stone-600 dark:text-stone-400">
                      {provider ? `${provider.name} • ${provider.model ?? 'choose a model'}` : '—'}
                    </div>
                  </div>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-stone-100 dark:bg-stone-900/60 text-stone-700 dark:text-stone-200">
                    Mode: BYOK
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                    <KeyRound className="w-4 h-4 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
                    API key
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        aria-label="Provider API key"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        type={reveal ? 'text' : 'password'}
                        placeholder={provider?.hasKey ? "Leave blank to keep saved key" : "Paste your API key"}
                        className="w-full pr-10 pl-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                      <button
                        type="button"
                        onClick={() => setReveal((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
                        aria-label={reveal ? 'Hide key' : 'Reveal key'}
                        title={reveal ? 'Hide' : 'Reveal'}
                      >
                        {reveal ? <EyeOff className="w-4 h-4" strokeWidth={1.75} /> : <Eye className="w-4 h-4" strokeWidth={1.75} />}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={saving || !provider || !(models[provider.id] ?? provider.model ?? '').trim() || (!apiKey.trim() && !provider.hasKey)}
                      onClick={async () => {
                        if (!provider || saving) return
                        setSaving(true)
                        try {
                          const success = await onSaveApiKey?.(provider.id, apiKey, models[provider.id] ?? provider.model ?? '')
                          if (success) { setApiKey(''); setReveal(false) }
                        } finally { setSaving(false) }
                      }}
                      className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {provider && <label className="block text-sm font-medium">Model ID<input value={models[provider.id] ?? provider.model ?? ''} onChange={e => setModels(previous => ({ ...previous, [provider.id]: e.target.value }))} placeholder="Exact model ID from your provider" maxLength={120} className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base dark:border-stone-700 dark:bg-stone-900" /></label>}
                  <p className="text-xs text-stone-500 dark:text-stone-500">
                    New keys are encrypted on the backend. Choose a text-generation model available to your provider account. Saved keys are never sent back to this browser.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Integrations */}
          <div className="space-y-3">
            <div>
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Third-party integrations</h2>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                Grocery services, calendars, and smart kitchen devices are not available yet. There is nothing to connect,
                and nothing in Sous Chef depends on them.
                {onOpenExtensionCatalog ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      onClick={onOpenExtensionCatalog}
                      className="underline text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
                    >
                      Preview the extension catalog
                    </button>
                    .
                  </>
                ) : null}
              </p>
            </div>
            {integrations.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {integrations.map((it) => (
                  <IntegrationRow key={it.id} integration={it} onDisconnect={onDisconnectIntegration} />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}


