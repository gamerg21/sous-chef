'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronUp, LogOut, User as UserIcon } from 'lucide-react'

export type ShellUser = { name: string; avatarUrl?: string }

export interface UserMenuProps {
  user?: ShellUser
  onNavigate?: (href: string) => void
  onPrefetch?: (href: string) => void
  onLogout?: () => void
  neutral: {
    panelBorder: string
    muted: string
  }
  accent: {
    ring: string
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const menuLinks = [
  { href: '/settings/account', label: 'Account & preferences', icon: UserIcon },
] as const

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((p) => p[0]).join('')
  return letters.toUpperCase()
}

export default function UserMenu({ user, onNavigate, onPrefetch, onLogout, neutral, accent }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const displayName = user?.name || 'User'
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hover opens it for mouse users; a short delay lets the pointer cross the gap to the card.
  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  const itemClassName =
    'w-full min-h-11 flex items-center gap-3 rounded-xl px-3 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600'

  return (
    <div ref={rootRef} className="relative" onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className={cx(
            'animate-pop-in absolute inset-x-0 bottom-full z-50 mb-2 origin-bottom rounded-2xl border bg-white p-1.5 shadow-xl shadow-stone-900/10 dark:bg-stone-900 dark:shadow-black/40',
            neutral.panelBorder
          )}
        >
          {menuLinks.map((link) => {
            const Icon = link.icon
            return (
              <button
                key={link.href}
                type="button"
                role="menuitem"
                onMouseEnter={() => onPrefetch?.(link.href)}
                onFocus={() => onPrefetch?.(link.href)}
                onTouchStart={() => onPrefetch?.(link.href)}
                onClick={() => {
                  setOpen(false)
                  onNavigate?.(link.href)
                }}
                className={itemClassName}
              >
                <Icon className="w-4 h-4 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
                {link.label}
              </button>
            )
          })}

          <div className={cx('my-1 border-t', neutral.panelBorder)} role="separator" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout?.()
            }}
            className={itemClassName}
          >
            <LogOut className="w-4 h-4 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
            Log out
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'w-full min-h-12 flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors',
          open ? 'bg-stone-100 dark:bg-stone-900/60' : 'hover:bg-stone-100 dark:hover:bg-stone-900/50',
          'focus-visible:outline-none focus-visible:ring-2',
          accent.ring
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied avatar URL
            <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              {initials(displayName)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 text-left">
          <div className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{displayName}</div>
          <div className={cx('text-xs truncate', neutral.muted)}>Your account</div>
        </div>

        <ChevronUp
          className={cx('w-4 h-4 shrink-0 text-stone-400 dark:text-stone-500 transition-transform duration-300', open ? 'rotate-180' : '')}
          strokeWidth={1.75}
        />
      </button>
    </div>
  )
}
