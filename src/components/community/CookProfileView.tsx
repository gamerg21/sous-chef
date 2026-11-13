'use client'
import Link from 'next/link'
import { ChefHat, EyeOff } from 'lucide-react'
import { api } from '@/lib/kitchen/api'
import { BlockCookButton } from '@/components/community/safety'
import { buttonClassName, cardClassName, cx, EmptyState, eyebrowClassName, headingFont, PageContainer, Section } from '@/components/ui/kit'
import { PagedRecipes } from './CommunityRecipeFeedView'
import { plural } from './feed-logic'
import { BackLink, FollowButton, ProblemState } from './parts'
import { CommunityNotices, useAnnounce, useCommunityQuery, useFeed, useFollow, useRefreshCommunity } from './useCommunity'

function ProfileSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading cook…</span>
      <div aria-hidden="true" className={cx(cardClassName, 'space-y-4 p-5')}>
        <div className="flex items-center gap-4">
          <div className="skeleton h-16 w-16 !rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-7 w-48 max-w-full" />
            <div className="skeleton h-4 w-64 max-w-full" />
          </div>
        </div>
        <div className="skeleton h-14 w-full" />
      </div>
    </div>
  )
}

function Profile({ id }: { id: string }) {
  const announce = useAnnounce()
  const refresh = useRefreshCommunity()
  const cook = useCommunityQuery(api.community.cook, id ? { id } : 'skip', { poll: true })
  const follow = useFollow()
  const profile = cook.data
  const recipes = useFeed({ kind: 'all', author: id, sort: 'new' }, { enabled: !!profile && !profile.blocked })

  if (!profile) {
    return (
      <PageContainer width="6xl">
        <BackLink href="/community/recipes">Community recipes</BackLink>
        {cook.error ? <ProblemState error={cook.error} onRetry={cook.refetch} retrying={cook.refetching} /> : <ProfileSkeleton />}
      </PageContainer>
    )
  }

  const own = profile.viewer?.own === true
  const following = profile.viewer?.following === true
  const initial = Array.from(profile.name.trim())[0]?.toUpperCase()
  const stats = [
    { label: 'Recipes', value: profile.recipeCount },
    { label: 'Followers', value: profile.followerCount },
    { label: 'Following', value: profile.followingCount },
  ]

  return (
    <PageContainer width="6xl">
      <BackLink href="/community/recipes">Community recipes</BackLink>

      <header className={cx(cardClassName, 'overflow-hidden')}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200" style={headingFont}>
              {initial || <ChefHat className="h-7 w-7" strokeWidth={1.5} />}
            </span>
            <div className="min-w-0">
              <p className={cx(eyebrowClassName, 'mb-0.5')}>{own ? 'Your community profile' : 'Community cook'}</p>
              <h1 className="break-words text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl dark:text-stone-100" style={headingFont}>
                {profile.name}
              </h1>
              {profile.bio && <p className="mt-1 max-w-2xl whitespace-pre-line break-words text-base text-stone-600 dark:text-stone-400">{profile.bio}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {own ? (
              <Link href="/community/mine" className={buttonClassName('secondary', 'sm')}>
                My shared recipes
              </Link>
            ) : (
              <>
                {!profile.blocked && <FollowButton following={following} pending={follow.pending.has(profile.id)} onToggle={() => void follow.toggle(profile, following)} name={profile.name} />}
                <BlockCookButton
                  cook={{ id: profile.id, name: profile.name }}
                  blocked={profile.blocked}
                  onChange={(blocked) => {
                    refresh()
                    announce(blocked ? `${profile.name} is blocked. Their recipes and tips are hidden.` : `${profile.name} is no longer blocked.`)
                  }}
                />
              </>
            )}
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-stone-200 border-t border-stone-200 text-center dark:divide-stone-800 dark:border-stone-800">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 px-2 py-3">
              <dt className={eyebrowClassName}>{stat.label}</dt>
              <dd className="mt-0.5 truncate text-xl font-semibold tabular-nums text-stone-900 dark:text-stone-100" style={headingFont}>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Section title={own ? 'Your public recipes' : `Recipes by ${profile.name}`} aside={!profile.blocked && !recipes.loading && !recipes.error && recipes.available ? (recipes.hasMore ? `${recipes.recipes.length} loaded` : plural(recipes.recipes.length, 'recipe')) : undefined}>
        {profile.blocked ? (
          <div className={cardClassName}>
            <EmptyState icon={EyeOff} title="You’ve blocked this cook" description="Their recipes and tips are hidden from you. Unblock them to see their recipes again." />
          </div>
        ) : (
          <PagedRecipes feed={recipes} hideCookLink empty={<EmptyState icon={ChefHat} title="No public recipes yet" description={own ? 'Recipes you share publicly will appear here.' : 'This cook hasn’t shared any public recipes.'} />} />
        )}
      </Section>
    </PageContainer>
  )
}

export function CookProfileView({ id }: { id: string }) {
  return (
    <CommunityNotices>
      <Profile key={id} id={id} />
    </CommunityNotices>
  )
}
