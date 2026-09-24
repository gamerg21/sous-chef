'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const START_EVENT = 'sous-chef:navigation-start'
// Fast navigations finish silently; the bar only appears for slow ones.
const SHOW_AFTER_MS = 400

/** Shows the progress bar for programmatic navigation (router.push). */
export function startNavigationProgress(href: string) {
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: href }))
}

function targetPath(href: string) {
  try {
    const url = new URL(href, window.location.href)
    return url.origin === window.location.origin ? url.pathname : null
  } catch {
    return null
  }
}

/**
 * Slim bar across the top of the app while a slow route loads. Starts on
 * internal link clicks or startNavigationProgress(), and completes once the
 * path changes.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  // The path the navigation started from; loading until the path moves on.
  const [startedFrom, setStartedFrom] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const state = startedFrom === null ? 'idle' : startedFrom === pathname ? 'loading' : 'done'

  useEffect(() => {
    const begin = (href: string) => {
      const path = targetPath(href)
      if (path && path !== window.location.pathname) {
        setSlow(false)
        setStartedFrom(window.location.pathname)
      }
    }
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return
      begin(anchor.href)
    }
    const onStart = (event: Event) => begin((event as CustomEvent<string>).detail)
    document.addEventListener('click', onClick, true)
    window.addEventListener(START_EVENT, onStart)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener(START_EVENT, onStart)
    }
  }, [])

  useEffect(() => {
    if (state !== 'loading') return
    const reveal = setTimeout(() => setSlow(true), SHOW_AFTER_MS)
    // Give up on a navigation that never lands.
    const abandon = setTimeout(() => setStartedFrom(null), 10_000)
    return () => {
      clearTimeout(reveal)
      clearTimeout(abandon)
    }
  }, [state, startedFrom])

  useEffect(() => {
    if (state !== 'done') return
    // Let the completed bar fade out, or finish at once if it never appeared.
    const id = setTimeout(() => setStartedFrom(null), slow ? 450 : 0)
    return () => clearTimeout(id)
  }, [state, slow])

  if (state === 'idle' || !slow) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5" aria-hidden="true">
      <div
        key={startedFrom}
        data-state={state}
        className="nav-progress h-full w-full bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_0_8px_rgb(16_185_129/0.6)]"
      />
    </div>
  )
}
