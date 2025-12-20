import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Menu, X } from 'lucide-react'
import MainNav, { type NavigationItem } from './MainNav'
import UserMenu, { type ShellUser } from './UserMenu'

export interface AppShellProps {
  children: ReactNode
  navigationItems: Array<{ label: string; href: string; isActive?: boolean }>
  user?: { name: string; avatarUrl?: string }
  onNavigate?: (href: string) => void
  onLogout?: () => void
}

type ColorName =
  | 'slate'
  | 'gray'
  | 'zinc'
  | 'neutral'
  | 'stone'
  | 'blue'
  | 'indigo'
  | 'violet'
  | 'purple'
  | 'fuchsia'
  | 'pink'
  | 'rose'
  | 'red'
  | 'orange'
  | 'amber'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'emerald'
  | 'teal'
  | 'cyan'
  | 'sky'

export interface ShellTokens {
  colors?: {
    primary?: string
    secondary?: string
    neutral?: string
  } | null
  typography?: {
    heading?: string
    body?: string
    mono?: string
  } | null
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function accentClasses(primary: string | undefined) {
  const c = (primary || 'emerald') as ColorName

  switch (c) {
    case 'emerald':
      return {
        activeBg: 'bg-emerald-50 dark:bg-emerald-950/30',
        activeText: 'text-emerald-800 dark:text-emerald-200',
        activeIcon: 'text-emerald-700 dark:text-emerald-300',
        ring: 'focus-visible:ring-emerald-500/30',
        pill: 'bg-emerald-600 text-white',
      }
    case 'teal':
      return {
        activeBg: 'bg-teal-50 dark:bg-teal-950/30',
        activeText: 'text-teal-800 dark:text-teal-200',
        activeIcon: 'text-teal-700 dark:text-teal-300',
        ring: 'focus-visible:ring-teal-500/30',
        pill: 'bg-teal-600 text-white',
      }
    case 'blue':
      return {
        activeBg: 'bg-blue-50 dark:bg-blue-950/30',
        activeText: 'text-blue-800 dark:text-blue-200',
        activeIcon: 'text-blue-700 dark:text-blue-300',
        ring: 'focus-visible:ring-blue-500/30',
        pill: 'bg-blue-600 text-white',
      }
    case 'indigo':
      return {
        activeBg: 'bg-indigo-50 dark:bg-indigo-950/30',
        activeText: 'text-indigo-800 dark:text-indigo-200',
        activeIcon: 'text-indigo-700 dark:text-indigo-300',
        ring: 'focus-visible:ring-indigo-500/30',
        pill: 'bg-indigo-600 text-white',
      }
    case 'violet':
      return {
        activeBg: 'bg-violet-50 dark:bg-violet-950/30',
        activeText: 'text-violet-800 dark:text-violet-200',
        activeIcon: 'text-violet-700 dark:text-violet-300',
        ring: 'focus-visible:ring-violet-500/30',
        pill: 'bg-violet-600 text-white',
      }
    case 'rose':
      return {
        activeBg: 'bg-rose-50 dark:bg-rose-950/30',
        activeText: 'text-rose-800 dark:text-rose-200',
        activeIcon: 'text-rose-700 dark:text-rose-300',
        ring: 'focus-visible:ring-rose-500/30',
        pill: 'bg-rose-600 text-white',
      }
    case 'amber':
      return {
        activeBg: 'bg-amber-50 dark:bg-amber-950/30',
        activeText: 'text-amber-900 dark:text-amber-200',
        activeIcon: 'text-amber-800 dark:text-amber-300',
        ring: 'focus-visible:ring-amber-500/30',
        pill: 'bg-amber-600 text-white',
      }
    case 'lime':
      return {
        activeBg: 'bg-lime-50 dark:bg-lime-950/30',
        activeText: 'text-lime-900 dark:text-lime-200',
        activeIcon: 'text-lime-800 dark:text-lime-300',
        ring: 'focus-visible:ring-lime-500/30',
        pill: 'bg-lime-600 text-white',
      }
    default:
      return {
        activeBg: 'bg-stone-100 dark:bg-stone-900/40',
        activeText: 'text-stone-900 dark:text-stone-100',
        activeIcon: 'text-stone-700 dark:text-stone-300',
        ring: 'focus-visible:ring-stone-500/30',
        pill: 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900',
      }
  }
}

function neutralClasses(neutral: string | undefined) {
  const c = (neutral || 'stone') as ColorName
  switch (c) {
    case 'slate':
      return {
        pageBg: 'bg-slate-50 dark:bg-slate-950',
        panelBg: 'bg-white dark:bg-slate-950',
        panelBorder: 'border-slate-200 dark:border-slate-800',
        text: 'text-slate-900 dark:text-slate-100',
        muted: 'text-slate-600 dark:text-slate-400',
      }
    case 'zinc':
      return {
        pageBg: 'bg-zinc-50 dark:bg-zinc-950',
        panelBg: 'bg-white dark:bg-zinc-950',
        panelBorder: 'border-zinc-200 dark:border-zinc-800',
        text: 'text-zinc-900 dark:text-zinc-100',
        muted: 'text-zinc-600 dark:text-zinc-400',
      }
    case 'gray':
      return {
        pageBg: 'bg-gray-50 dark:bg-gray-950',
        panelBg: 'bg-white dark:bg-gray-950',
        panelBorder: 'border-gray-200 dark:border-gray-800',
        text: 'text-gray-900 dark:text-gray-100',
        muted: 'text-gray-600 dark:text-gray-400',
      }
    case 'neutral':
      return {
        pageBg: 'bg-neutral-50 dark:bg-neutral-950',
        panelBg: 'bg-white dark:bg-neutral-950',
        panelBorder: 'border-neutral-200 dark:border-neutral-800',
        text: 'text-neutral-900 dark:text-neutral-100',
        muted: 'text-neutral-600 dark:text-neutral-400',
      }
    case 'stone':
    default:
      return {
        pageBg: 'bg-stone-50 dark:bg-stone-950',
        panelBg: 'bg-white dark:bg-stone-950',
        panelBorder: 'border-stone-200 dark:border-stone-800',
        text: 'text-stone-900 dark:text-stone-100',
        muted: 'text-stone-600 dark:text-stone-400',
      }
  }
}

interface AppShellInternalProps extends AppShellProps {
  tokens?: ShellTokens | null
  brand?: { name?: string } | null
}

function AppShellInternal({
  children,
  navigationItems,
  user,
  onNavigate,
  onLogout,
  tokens,
  brand,
}: AppShellInternalProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const accent = useMemo(() => accentClasses(tokens?.colors?.primary), [tokens?.colors?.primary])
  const neutral = useMemo(() => neutralClasses(tokens?.colors?.neutral), [tokens?.colors?.neutral])

  const headingFont = tokens?.typography?.heading || 'Manrope'
  const bodyFont = tokens?.typography?.body || 'Inter'
  const monoFont = tokens?.typography?.mono || 'JetBrains Mono'

  const navItems: NavigationItem[] = navigationItems
  const shellUser: ShellUser | undefined = user

  return (
    <div
      className={cx('min-h-screen w-full', neutral.pageBg, neutral.text)}
      style={{
        fontFamily: bodyFont,
      }}
    >
      {/* Mobile top bar */}
      <div className={cx('lg:hidden sticky top-0 z-40', neutral.panelBg, 'border-b', neutral.panelBorder)}>
        <div className="h-14 px-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className={cx(
              'inline-flex items-center justify-center rounded-md h-9 w-9 border',
              neutral.panelBorder,
              'bg-white/50 dark:bg-black/10',
              'focus-visible:outline-none focus-visible:ring-2',
              accent.ring
            )}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ fontFamily: headingFont }}>
              {brand?.name || 'Sous Chef'}
            </div>
            <div className={cx('text-xs', neutral.muted)} style={{ fontFamily: monoFont }}>
              Household Kitchen
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation overlay"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className={cx(
              'absolute left-0 top-0 h-full w-[min(20rem,85vw)]',
              neutral.panelBg,
              'border-r',
              neutral.panelBorder,
              'p-3 flex flex-col'
            )}
          >
            <div className="flex items-center justify-between gap-3 px-2 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate" style={{ fontFamily: headingFont }}>
                  {brand?.name || 'Sous Chef'}
                </div>
                <div className={cx('text-xs', neutral.muted)} style={{ fontFamily: monoFont }}>
                  Household Kitchen
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className={cx(
                  'inline-flex items-center justify-center rounded-md h-9 w-9 border',
                  neutral.panelBorder,
                  'bg-white/50 dark:bg-black/10',
                  'focus-visible:outline-none focus-visible:ring-2',
                  accent.ring
                )}
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mt-2 flex-1 overflow-y-auto px-1">
              <MainNav
                navigationItems={navItems}
                onNavigate={(href) => {
                  onNavigate?.(href)
                  setMobileNavOpen(false)
                }}
                accent={accent}
                neutral={neutral}
                headingFont={headingFont}
              />
            </div>

            <div className={cx('pt-3 mt-3 border-t', neutral.panelBorder)}>
              <UserMenu user={shellUser} onNavigate={onNavigate} onLogout={onLogout} neutral={neutral} accent={accent} />
            </div>
          </aside>
        </div>
      )}

      {/* Desktop layout */}
      <div className="hidden lg:flex h-screen overflow-hidden">
        <aside className={cx('w-72 shrink-0 border-r h-screen', neutral.panelBorder, neutral.panelBg)}>
          <div className="h-full flex flex-col overflow-hidden">
            <div className={cx('px-5 py-5 border-b', neutral.panelBorder)}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold" style={{ fontFamily: headingFont }}>
                    {brand?.name || 'Sous Chef'}
                  </div>
                  <div className={cx('text-xs mt-1', neutral.muted)} style={{ fontFamily: monoFont }}>
                    Household Kitchen
                  </div>
                </div>
                <span className={cx('text-[11px] px-2 py-1 rounded-full', accent.pill)} style={{ fontFamily: monoFont }}>
                  Beta
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              <MainNav
                navigationItems={navItems}
                onNavigate={onNavigate}
                accent={accent}
                neutral={neutral}
                headingFont={headingFont}
              />
            </div>

            <div className={cx('p-3 border-t', neutral.panelBorder)}>
              <UserMenu user={shellUser} onNavigate={onNavigate} onLogout={onLogout} neutral={neutral} accent={accent} />
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 h-screen overflow-y-auto">
          <div className="min-h-full">{children}</div>
        </main>
      </div>

      {/* Mobile content */}
      <div className="lg:hidden">{children}</div>
    </div>
  )
}

/**
 * Default export: portable shell component. Tokens/brand can be provided by a preview wrapper.
 */
export default function AppShell(props: AppShellProps) {
  return <AppShellInternal {...props} />
}

export { AppShellInternal }


