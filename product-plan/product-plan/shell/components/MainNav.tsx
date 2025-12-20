import {
  Boxes,
  BookOpen,
  ShoppingCart,
  Users,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavigationItem = { label: string; href: string; isActive?: boolean }

export interface MainNavProps {
  navigationItems: NavigationItem[]
  onNavigate?: (href: string) => void
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
  if (normalized.includes('shopping') || normalized.includes('cook')) return ShoppingCart
  if (normalized.includes('community') || normalized.includes('extension')) return Users
  if (normalized.includes('settings')) return Settings
  return Boxes
}

export default function MainNav({
  navigationItems,
  onNavigate,
  accent,
  neutral,
  headingFont,
}: MainNavProps) {
  return (
    <nav className="space-y-1">
      <div className={cx('px-2 pb-2 text-[11px] uppercase tracking-wide', neutral.muted)} style={{ fontFamily: headingFont }}>
        Kitchen
      </div>

      <ul className="space-y-1">
        {navigationItems.map((item) => {
          const Icon = iconForLabel(item.label)
          const active = Boolean(item.isActive)

          return (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => onNavigate?.(item.href)}
                className={cx(
                  'w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm text-left',
                  'transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2',
                  accent.ring,
                  active
                    ? cx(accent.activeBg, accent.activeText)
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


