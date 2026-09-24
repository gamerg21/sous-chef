'use client'

import { useLayoutEffect, useRef } from 'react'
import {
  Boxes,
  BookOpen,
  ShoppingCart,
  ChefHat,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavigationItem = { label: string; href: string; isActive?: boolean }

export interface MainNavProps {
  navigationItems: NavigationItem[]
  onNavigate?: (href: string) => void
  onPrefetch?: (href: string) => void
  accent: {
    activeBg: string
    activeText: string
    activeIcon: string
    ring: string
  }
  neutral: {
    panelBorder: string
    muted: string
    text: string
  }
  headingFont?: string
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function iconForLabel(label: string): LucideIcon {
  const normalized = label.toLowerCase()
  if (normalized.includes('inventory')) return Boxes
  if (normalized.includes('recipe')) return BookOpen
  if (normalized.includes('cook')) return ChefHat
  if (normalized.includes('shopping')) return ShoppingCart
  if (normalized.includes('community') || normalized.includes('extension')) return Users
  if (normalized.includes('settings')) return Settings
  return Boxes
}

export default function MainNav({
  navigationItems,
  onNavigate,
  onPrefetch,
  accent,
  neutral,
  headingFont,
}: MainNavProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const indicatorRef = useRef<HTMLLIElement>(null)
  const activeHref = navigationItems.find((item) => item.isActive)?.href

  // One highlight glides between items instead of each item toggling its own.
  useLayoutEffect(() => {
    const indicator = indicatorRef.current
    const active = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!indicator) return
    if (!active) {
      indicator.style.opacity = '0'
      return
    }
    indicator.style.height = `${active.offsetHeight}px`
    indicator.style.transform = `translateY(${active.offsetTop}px)`
    indicator.style.opacity = '1'
    // Place it without animating on first paint; glide on later changes.
    requestAnimationFrame(() => { indicator.dataset.ready = 'true' })
  }, [activeHref])

  return (
    <nav className="space-y-1">
      <div className={cx('px-2 pb-2 text-[11px] uppercase tracking-wide', neutral.muted)} style={{ fontFamily: headingFont }}>
        Kitchen
      </div>

      <ul ref={listRef} className="relative space-y-1">
        <li
          ref={indicatorRef}
          aria-hidden="true"
          role="presentation"
          className={cx(
            'pointer-events-none absolute inset-x-0 top-0 rounded-md opacity-0',
            'data-[ready=true]:transition-[transform,height,opacity] data-[ready=true]:duration-300 data-[ready=true]:ease-[cubic-bezier(0.2,0.8,0.2,1)]',
            accent.activeBg
          )}
        />
        {navigationItems.map((item) => {
          const Icon = iconForLabel(item.label)
          const active = Boolean(item.isActive)

          return (
            <li key={item.href}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onNavigate?.(item.href)}
                onMouseEnter={() => onPrefetch?.(item.href)}
                onFocus={() => onPrefetch?.(item.href)}
                onTouchStart={() => onPrefetch?.(item.href)}
                className={cx(
                  'relative min-h-11 w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left',
                  'transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2',
                  accent.ring,
                  active
                    ? accent.activeText
                    : cx(
                        'text-stone-700 dark:text-stone-200',
                        'hover:bg-stone-100 dark:hover:bg-stone-900/50'
                      )
                )}
              >
                <Icon
                  className={cx('w-4 h-4 shrink-0', active ? accent.activeIcon : 'text-stone-500 dark:text-stone-400')}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 truncate">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
