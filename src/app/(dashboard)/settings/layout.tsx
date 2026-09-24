'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Download, Plug, User, Users } from 'lucide-react'
import { PageContainer, cx, eyebrowClassName } from '@/components/ui/kit'

const sections = [
  { href: '/settings/account', label: 'Account & preferences', icon: User },
  { href: '/settings/household-users', label: 'Household members', icon: Users },
  { href: '/settings/system', label: 'System & Updates', icon: Download },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug },
]

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <PageContainer width="4xl">
      <nav aria-label="Settings">
        <p className={cx(eyebrowClassName, 'mb-2 px-1')}>Settings</p>
        {/* Pill tabs scroll sideways on small screens instead of wrapping. */}
        <ul className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          {sections.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600',
                    active
                      ? 'border-emerald-200 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-stone-100'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </PageContainer>
  )
}
