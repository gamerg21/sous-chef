import { AlertTriangle, CheckCircle2, Link2 } from 'lucide-react'
import { buttonClassName, IconBadge, Pill, type Tone } from '@/components/ui/kit'
import type { Integration, IntegrationStatus } from './types'
import { cx } from './utils'

export interface IntegrationRowProps {
  integration: Integration
  onDisconnect?: (id: string) => void
}

function statusPill(status: IntegrationStatus): { label: string; tone: Tone; icon: typeof Link2 } {
  switch (status) {
    case 'connected':
      return { label: 'Connected', tone: 'success', icon: CheckCircle2 }
    case 'error':
      return { label: 'Needs attention', tone: 'danger', icon: AlertTriangle }
    case 'disconnected':
    default:
      return { label: 'Not connected', tone: 'neutral', icon: Link2 }
  }
}

/**
 * Read-only row, meant to sit inside a divided card. No provider adapter
 * exists yet, so there is no Connect or Manage action; a row that was marked
 * connected by earlier data can only be disconnected, which clears its stored tokens.
 */
export function IntegrationRow({ integration, onDisconnect }: IntegrationRowProps) {
  const pill = statusPill(integration.status)

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconBadge icon={pill.icon} tone={pill.tone} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-stone-900 dark:text-stone-100">{integration.name}</h3>
            <Pill tone={pill.tone}>{pill.label}</Pill>
          </div>
          <p className="mt-0.5 text-sm text-stone-600 dark:text-stone-400">{integration.description}</p>

          {(integration.scopes?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              {integration.scopes!.slice(0, 3).map((s) => (
                <span key={s} className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-stone-700 dark:bg-stone-800/70 dark:text-stone-300">
                  {s}
                </span>
              ))}
              {integration.scopes && integration.scopes.length > 3 && <span className="text-stone-500">+{integration.scopes.length - 3}</span>}
            </div>
          )}

          {integration.lastSyncAt && <div className="mt-1.5 text-xs text-stone-500">Last sync: {integration.lastSyncAt}</div>}
        </div>
      </div>

      {integration.status === 'connected' && onDisconnect ? (
        <button
          type="button"
          onClick={() => onDisconnect(integration.id)}
          className={cx(buttonClassName('secondary'), 'min-h-11 shrink-0 self-end text-rose-700 sm:self-auto dark:text-rose-300')}
        >
          Disconnect
        </button>
      ) : null}
    </div>
  )
}
