'use client'
import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, ChefHat, ChevronRight, Download, ShieldCheck, UserRound, Users } from 'lucide-react'
import { buttonClassName, cardClassName, cx, EmptyState, IconBadge, PageContainer, PageHeader, rowsClassName, Section, StatusDot, type Tone } from '@/components/ui/kit'
import { CommunityRecipeGrid } from './CommunityRecipeCard'
import { CommunityUpdatesSection } from './CommunityUpdates'
import { describeProblem } from './feed-logic'
import { focusRing, ProblemState, RecipeGridSkeleton } from './parts'
import { CommunityNotices, useFeed, useMe } from './useCommunity'

const rowLink = 'flex min-h-14 items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/40'

function RowLink({ href, icon, tone, title, hint }: { href: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; tone: Tone; title: string; hint: string }) {
  return (
    <li>
      <Link className={rowLink} href={href}>
        <IconBadge icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">{title}</span>
          <span className="block text-xs text-stone-500 dark:text-stone-400">{hint}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </li>
  )
}

function SeeAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx('-my-2 inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300', focusRing)}>
      {children}
      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
    </Link>
  )
}

function Hub() {
  const me = useMe()
  const trending = useFeed({ kind: 'all', sort: 'hot' }, { limit: 6 })
  const state = me.data
  const configured = state?.configured !== false
  // Matching reads up to 100 recipes, so it waits until the community has answered once.
  const pantry = useFeed({ kind: 'all', sort: 'hot', pantry: true }, { enabled: configured && !trending.loading && trending.available && !trending.error && trending.recipes.length > 0 })
  // Only recipes the kitchen has something for; none means an empty pantry or no overlap.
  const pantryMatches = pantry.recipes.filter((recipe) => (recipe.pantry?.have ?? 0) > 0).slice(0, 3)

  // An expired sign-in or a rate limit is an answer: the service is there.
  const answered = !trending.error || ['reconnect', 'not_connected', 'rate_limited'].includes(describeProblem(trending.error).kind)
  const online = configured && trending.available && answered
  const settling = me.loading || trending.loading
  const account = state?.me
  const connected = state?.connected === true
  // Connected here but the community didn't recognise the sign-in (or didn't answer).
  const stale = connected && !account && !me.loading && online

  return (
    <PageContainer width="6xl">
      <PageHeader
        eyebrow="Recipe community"
        title="Community"
        description="Recipes shared by cooks across the wider Sous Chef community. Browse, save copies to your private kitchen, and share your own."
        actions={
          <Link href="/recipes" className={buttonClassName('primary')}>
            Share a recipe
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </Link>
        }
      />

      <div className={cx(cardClassName, 'overflow-hidden')}>
        <div className="flex min-h-12 items-center gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <StatusDot tone={settling ? 'neutral' : online ? 'success' : 'warning'} />
          <p role="status" className="min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-300">
            {settling
              ? 'Checking the community service…'
              : online
                ? 'The community is online. Recipes here come from cooks on many Sous Chef kitchens, not only this one.'
                : configured
                  ? 'The community service isn’t answering right now. Your own recipes and pantry are unaffected.'
                  : 'This kitchen isn’t set up to reach the community. Your own recipes and pantry are ready to use.'}
          </p>
        </div>
        <ul className={rowsClassName}>
          <RowLink
            href="/community/connect"
            icon={UserRound}
            tone={account ? 'success' : stale ? 'warning' : 'neutral'}
            title={account ? `Connected as ${account.name}` : stale ? 'Reconnect your community account' : connected ? 'Community account' : 'Connect community account'}
            hint={account ? 'Like, follow, rate and share as this cook.' : stale ? 'Your sign-in may have expired. Reconnect to like, follow and share.' : connected ? 'Manage this kitchen’s community connection.' : 'Sign in to like, follow, rate and share recipes.'}
          />
          <RowLink href="/community/recipes" icon={BookOpen} tone="success" title="Browse community recipes" hint="Search, filter by tag, or match against your pantry." />
          <RowLink href="/community/mine" icon={ChefHat} tone="neutral" title="My shared recipes" hint="What you’ve shared and whether it’s public." />
          {account?.moderator && <RowLink href="/community/moderation" icon={ShieldCheck} tone="warning" title="Moderation" hint="Review reports from the community." />}
          <RowLink href="/explore" icon={Download} tone="info" title="Public recipe downloads" hint="Browse without a kitchen account." />
        </ul>
      </div>

      <Section title="Trending recipes" aside={trending.recipes.length > 0 ? <SeeAll href="/community/recipes?sort=hot">View all</SeeAll> : undefined}>
        {trending.loading ? (
          <RecipeGridSkeleton count={3} />
        ) : trending.error ? (
          <ProblemState error={trending.error} onRetry={trending.refetch} />
        ) : !trending.available ? (
          <div className={cardClassName} role="status">
            <EmptyState
              icon={Users}
              title="Community recipes aren’t available"
              description={configured ? 'The community service didn’t answer. Try again in a moment.' : 'This kitchen has no community service configured.'}
              action={
                configured && (
                  <button type="button" onClick={trending.refetch} className={buttonClassName('secondary')}>
                    Try again
                  </button>
                )
              }
            />
          </div>
        ) : trending.recipes.length === 0 ? (
          <div className={cardClassName}>
            <EmptyState icon={Users} title="Nothing shared yet" description="Recipes that cooks share with the community will appear here. Share one of yours to start." />
          </div>
        ) : (
          <CommunityRecipeGrid recipes={trending.recipes.slice(0, 6)} className="stagger" />
        )}
      </Section>

      {/* Below the recipes: these arrive later and must not push what is being read. */}
      <CommunityUpdatesSection />

      {pantryMatches.length > 0 && (
        <Section title="Cook from your pantry" aside={<SeeAll href="/community/recipes?pantry=1">More matches</SeeAll>}>
          <CommunityRecipeGrid recipes={pantryMatches} />
        </Section>
      )}

      <p className="max-w-3xl px-1 text-xs text-stone-500 dark:text-stone-500">
        Your pantry, plans and private recipes never leave this kitchen. Only recipes you choose to share are sent to the community.
      </p>
    </PageContainer>
  )
}

export function CommunityHubView() {
  return (
    <CommunityNotices>
      <Hub />
    </CommunityNotices>
  )
}
