'use client'

import { useState } from 'react'
import { ChevronUp, LogOut, User as UserIcon } from 'lucide-react'

export type ShellUser = { name: string; avatarUrl?: string }

export interface UserMenuProps {
  user?: ShellUser
  onNavigate?: (href: string) => void
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((p) => p[0]).join('')
  return letters.toUpperCase()
}

export default function UserMenu({ user, onNavigate, onLogout, neutral, accent }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const displayName = user?.name || 'User'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'w-full flex items-center gap-3 rounded-md px-3 py-2',
          'hover:bg-stone-100 dark:hover:bg-stone-900/50',
          'focus-visible:outline-none focus-visible:ring-2',
          accent.ring
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className={cx('h-9 w-9 rounded-full border flex items-center justify-center', neutral.panelBorder)}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">
              {initials(displayName)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 text-left">
          <div className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{displayName}</div>
          <div className={cx('text-xs truncate', neutral.muted)}>Household member</div>
        </div>

        <ChevronUp
          className={cx('w-4 h-4 text-stone-400 dark:text-stone-500 transition-transform', open ? 'rotate-180' : '')}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <div
          role="menu"
          className={cx(
            'absolute left-0 bottom-[calc(100%+0.5rem)] w-full rounded-md border shadow-lg',
            neutral.panelBorder,
            'bg-white dark:bg-stone-950 overflow-hidden'
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onNavigate?.('/settings')
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/50"
          >
            <UserIcon className="w-4 h-4 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
            Settings
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout?.()
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-900/50"
          >
            <LogOut className="w-4 h-4 text-stone-500 dark:text-stone-400" strokeWidth={1.75} />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

