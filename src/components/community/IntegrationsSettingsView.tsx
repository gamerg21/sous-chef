import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Sparkles, Wrench } from 'lucide-react'
import {
  buttonClassName,
  cardClassName,
  eyebrowClassName,
  fieldClassName,
  headingFont,
  IconBadge,
  iconButtonClassName,
  optionClassName,
  PageContainer,
  PageHeader,
  Pill,
  rowsClassName,
  Section,
  StatusDot,
} from '@/components/ui/kit'
import type { AiSettings, Integration } from './types'
import { IntegrationRow } from './IntegrationRow'
import { cx } from './utils'
import OpenFoodFactsSettings from '@/components/OpenFoodFactsSettings'

export interface IntegrationsSettingsViewProps {
  embedded?: boolean
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
    embedded = false,
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

  const saveDisabled = saving || !provider || !(models[provider.id] ?? provider.model ?? '').trim() || (!apiKey.trim() && !provider.hasKey)

  const content = (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Integrations"
        description="Connect food data and AI providers to your kitchen. Settings apply to the whole household."
        actions={
          onBack ? (
            <button type="button" onClick={onBack} className={buttonClassName('secondary')}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Back
            </button>
          ) : null
        }
      />

      <OpenFoodFactsSettings />

      {/* AI providers */}
      <Section
        title="AI configuration"
        aside={
          <button type="button" onClick={onTestAiConnection} className={cx(buttonClassName('ghost', 'sm'), '-my-2')}>
            <Wrench className="h-4 w-4" strokeWidth={1.75} />
            Test
          </button>
        }
      >
        <div className={cx(cardClassName, 'overflow-hidden')}>
          <div className="flex items-start gap-3 p-4">
            <IconBadge icon={Sparkles} tone="success" />
            <p className="min-w-0 flex-1 pt-1 text-sm text-stone-600 dark:text-stone-400">
              Self-hosted setup uses BYOK. Enter your API key per provider to control billing and usage.
            </p>
            <Pill tone="neutral" className="shrink-0">Mode: BYOK</Pill>
          </div>

          <div className="grid grid-cols-1 border-t border-stone-200 lg:grid-cols-5 dark:border-stone-800">
            {/* Provider selection */}
            <div className="border-b border-stone-200 bg-stone-50/60 p-3 lg:col-span-2 lg:border-b-0 lg:border-r dark:border-stone-800 dark:bg-stone-950/30">
              <div className="px-1 pb-2">
                <div className={eyebrowClassName}>Provider</div>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Select which AI provider to use.</p>
              </div>
              <div className="space-y-1">
                {safeAi.providers.map((p) => {
                  const active = p.id === effectiveProviderId
                  const disabled = p.availableByok === false
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={disabled}
                      aria-pressed={active}
                      onClick={() => {
                        if (disabled || saving) return
                        setApiKey('')
                        setReveal(false)
                        if (onSelectActiveProvider) onSelectActiveProvider(p.id)
                        else setLocalProviderId(p.id)
                      }}
                      className={cx(optionClassName(active), 'py-2', disabled && 'cursor-not-allowed opacity-50')}
                    >
                      <StatusDot tone={p.hasKey ? 'success' : 'neutral'} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.name}</span>
                        <span className="block truncate text-xs font-normal text-stone-500 dark:text-stone-400">
                          {p.model || 'Choose a model'} · {p.hasKey ? 'Key saved' : 'Needs key'}
                        </span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.25} aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Selected provider */}
            <div className={cx('lg:col-span-3', rowsClassName)}>
              <div className="p-4">
                <div className={eyebrowClassName}>Selected provider</div>
                <div className="mt-0.5 text-base font-semibold text-stone-900 dark:text-stone-100" style={headingFont}>
                  {provider ? provider.name : '—'}
                </div>
                {provider && <div className="text-xs text-stone-500 dark:text-stone-400">{provider.model ?? 'choose a model'}</div>}
              </div>

              <div className="p-4">
                <div className={cx(eyebrowClassName, 'flex items-center gap-1.5')}>
                  <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                  API key
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <input
                      aria-label="Provider API key"
                      autoComplete="off"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      type={reveal ? 'text' : 'password'}
                      placeholder={provider?.hasKey ? "Leave blank to keep saved key" : "Paste your API key"}
                      className={cx(fieldClassName, 'pr-12')}
                    />
                    <button
                      type="button"
                      onClick={() => setReveal((v) => !v)}
                      className={cx(iconButtonClassName, 'absolute right-0.5 top-1/2 -translate-y-1/2')}
                      aria-label={reveal ? 'Hide key' : 'Reveal key'}
                      title={reveal ? 'Hide' : 'Reveal'}
                    >
                      {reveal ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={saveDisabled}
                    onClick={async () => {
                      if (!provider || saving) return
                      setSaving(true)
                      try {
                        const success = await onSaveApiKey?.(provider.id, apiKey, models[provider.id] ?? provider.model ?? '')
                        if (success) { setApiKey(''); setReveal(false) }
                      } finally { setSaving(false) }
                    }}
                    className={cx(buttonClassName('primary'), 'min-h-11 px-5')}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {provider && (
                <label className="block p-4">
                  <span className={eyebrowClassName}>Model ID</span>
                  <input
                    value={models[provider.id] ?? provider.model ?? ''}
                    onChange={(e) => setModels((previous) => ({ ...previous, [provider.id]: e.target.value }))}
                    placeholder="Exact model ID from your provider"
                    maxLength={120}
                    className={cx(fieldClassName, 'mt-2 font-mono')}
                  />
                </label>
              )}

              <p className="p-4 text-xs text-stone-500 dark:text-stone-500">
                New keys are encrypted on the backend. Choose a text-generation model available to your provider account. Saved keys are never sent back to this browser.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Integrations */}
      <Section title="More integrations">
        <div className={cx(cardClassName, rowsClassName, 'overflow-hidden')}>
          <p className="p-4 text-sm text-stone-600 dark:text-stone-400">
            Grocery services, calendars, and smart kitchen devices are not available yet. There is nothing to connect,
            and nothing in Sous Chef depends on them.
            {onOpenExtensionCatalog ? (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onOpenExtensionCatalog}
                  className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
                >
                  Preview the extension catalog
                </button>
                .
              </>
            ) : null}
          </p>
          {integrations.map((it) => (
            <IntegrationRow key={it.id} integration={it} onDisconnect={onDisconnectIntegration} />
          ))}
        </div>
      </Section>
    </>
  )

  if (embedded) return <div className="w-full space-y-6">{content}</div>
  return <PageContainer width="5xl">{content}</PageContainer>
}
