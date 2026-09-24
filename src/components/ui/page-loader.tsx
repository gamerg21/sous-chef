import { BrandLogo } from '@/components/BrandLogo'

/** Placeholder shaped like a typical page: heading, toolbar, and a list of cards. */
export function PageLoader({ rows = 5 }: { rows?: number }) {
  return (
    <div className="animate-fade-in px-4 py-6 sm:px-6 lg:px-8" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mx-auto max-w-6xl space-y-5" aria-hidden="true">
        <div className="space-y-2">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-72 max-w-full" />
        </div>
        <div className="skeleton h-11 w-full" />
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="skeleton h-20 w-full" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Full-screen branded splash while the kitchen session starts. */
export function AppSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 animate-fade-in" role="status" aria-live="polite">
      <div className="animate-breathe"><BrandLogo size={56} decorative /></div>
      <span className="text-sm text-stone-500 dark:text-stone-400">Warming up your kitchen…</span>
    </div>
  )
}
