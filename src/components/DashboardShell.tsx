'use client'

import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import AppShell from './shell/AppShell'

export interface DashboardShellProps {
  children: React.ReactNode
  navigationItems: Array<{ label: string; href: string }>
  user: {
    name: string
    avatarUrl?: string
  }
  households: Array<{ id: string; name: string }>
  currentHouseholdId: string
}

export function DashboardShell({
  children,
  navigationItems,
  user,
  households,
  currentHouseholdId,
}: DashboardShellProps) {
  const router = useRouter()

  const handleHouseholdChange = async (householdId: string) => {
    try {
      const response = await fetch('/api/household/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ householdId }),
      })

      if (response.ok) {
        // Refresh the page to update the server-side data
        router.refresh()
      } else {
        console.error('Failed to switch household')
      }
    } catch (error) {
      console.error('Error switching household:', error)
    }
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/auth/signin' })
  }

  return (
    <AppShell
      navigationItems={navigationItems}
      user={user}
      households={households}
      currentHouseholdId={currentHouseholdId}
      onHouseholdChange={handleHouseholdChange}
      onLogout={handleLogout}
    >
      {children}
    </AppShell>
  )
}
