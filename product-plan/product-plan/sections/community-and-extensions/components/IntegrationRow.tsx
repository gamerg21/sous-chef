import { AlertTriangle, CheckCircle2, Link2, PlugZap } from 'lucide-react'
import type { Integration, IntegrationStatus } from './types'
import { cx } from './utils'

export interface IntegrationRowProps {
  integration: Integration
  onConnect?: (id: string) => void
  onDisconnect?: (id: string) => void
  onManage?: (id: string) => void
}

function statusPill(status: IntegrationStatus) {
  switch (status) {
    case 'connected':
      return { label: 'Connected', cls: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200', icon: CheckCircle2 }
    case 'error':
      return { label: 'Needs attention', cls: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200', icon: AlertTriangle }
    case 'disconnected':
    default:
      return { label: 'Disconnected', cls: 'bg-stone-100 text-stone-700 dark:bg-stone-900/60 dark:text-stone-200', icon: Link2 }
  }
}

export function IntegrationRow({ integration, onConnect, onDisconnect, onManage }: IntegrationRowProps) {
  const pill = statusPill(integration.status)
  const Icon = pill.icon

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-medium text-stone-900 dark:text-stone-100 truncate">{integration.name}</h3>
            <span className={cx('text-[11px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1', pill.cls)}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
              {pill.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{integration.description}</p>

          {(integration.scopes?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {integration.scopes!.slice(0, 3).map((s) => (
                <span
                  key={s}
                  className="rounded-md bg-stone-100 dark:bg-stone-900/60 px-2 py-1 text-stone-700 dark:text-stone-200 font-mono"
                >
                  {s}
                </span>
              ))}
              {integration.scopes && integration.scopes.length > 3 && (
                <span className="text-stone-500 dark:text-stone-500">+{integration.scopes.length - 3}</span>
              )}
            </div>
          )}

          {integration.lastSyncAt && (
            <div className="mt-2 text-xs text-stone-500 dark:text-stone-500">Last sync: {integration.lastSyncAt}</div>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {integration.status === 'connected' ? (
            <>
              <button
                type="button"
                onClick={() => onManage?.(integration.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-800 dark:text-stone-100 text-sm font-medium hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
              >
                Manage
              </button>
              <button
                type="button"
                onClick={() => onDisconnect?.(integration.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200 text-sm font-medium hover:bg-rose-100/70 dark:hover:bg-rose-950/30 transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onConnect?.(integration.id)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <PlugZap className="w-4 h-4" strokeWidth={1.75} />
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


