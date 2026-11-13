import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, SearchX } from 'lucide-react';
import { publicFeed } from '@/server/kitchen/communityPublic';
import { buttonClassName, cardClassName, chipClassName, cx, EmptyState, fieldClassName, PageHeader, Section } from '@/components/ui/kit';
import { CommunityUnavailable, ExploreShell, RecipeCard } from './parts';
import { EXPLORE_SORTS, exploreHref, exploreQuery } from './query';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Recipes from the community · Sous Chef',
  description: 'Browse recipes shared by Sous Chef cooks. No account needed.',
};

const PAGE_SIZE = 24;
const pageLinkClassName = cx(buttonClassName('secondary'), 'min-h-11');

export default async function Explore({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = exploreQuery(await searchParams);
  const feed = await publicFeed({ ...query, limit: PAGE_SIZE });
  const legacy = feed.state === 'ok' && feed.legacy;
  const heading = query.search ? `Results for “${query.search}”` : query.tag ? `Tagged “${query.tag}”` : EXPLORE_SORTS.find(option => option.value === query.sort)?.label ?? 'Recipes';

  return (
    <ExploreShell>
      <PageHeader
        eyebrow="Recipe community"
        title="Recipes from the community"
        description="Browse what other cooks have shared. Download a recipe, then use Import in your recipe library. No account is needed to browse."
      />
      <form action="/explore" role="search" className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
          <input type="search" aria-label="Search recipes" name="q" defaultValue={query.search} maxLength={200} placeholder="Search recipes…" className={cx(fieldClassName, 'pl-10')} />
        </div>
        <button className={cx(buttonClassName('primary'), 'min-h-11')}>Search</button>
      </form>

      {feed.state === 'ok' && !legacy && (
        <div className="space-y-3">
          {!query.search && (
            <nav aria-label="Sort recipes" className="flex flex-wrap gap-2">
              {EXPLORE_SORTS.map(option => {
                const selected = option.value === query.sort;
                return (
                  <Link key={option.value} href={exploreHref({ tag: query.tag, sort: option.value })} aria-current={selected ? 'page' : undefined} className={cx(chipClassName(selected), 'min-h-11 px-4')}>
                    {option.label}
                  </Link>
                );
              })}
            </nav>
          )}
          {feed.tags.length > 0 && (
            <nav aria-label="Popular tags" className="flex flex-wrap gap-2">
              {feed.tags.map(({ tag }) => {
                const selected = !!query.tag && query.tag.toLowerCase() === tag.toLowerCase();
                return (
                  <Link
                    key={tag}
                    href={selected ? exploreHref({ sort: query.sort }) : exploreHref({ tag, sort: query.sort })}
                    aria-current={selected ? 'true' : undefined}
                    className={cx(chipClassName(selected), 'min-h-11 max-w-full sm:min-h-9')}
                  >
                    <span className="truncate">{tag}</span>
                    {selected && <span className="sr-only"> (selected; clears the tag)</span>}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}

      {feed.state !== 'ok' ? (
        <CommunityUnavailable />
      ) : feed.recipes.length === 0 ? (
        <div className={cardClassName}>
          <EmptyState
            icon={SearchX}
            title={query.cursor ? 'No more recipes' : 'No recipes found'}
            description={query.search || query.tag ? 'Try a different search or tag.' : query.cursor ? 'You’ve reached the end.' : 'Be the first to share one from your kitchen.'}
            action={query.search || query.tag || query.cursor ? <Link className={pageLinkClassName} href={exploreHref({ sort: query.sort })}>Show all recipes</Link> : undefined}
          />
        </div>
      ) : (
        <Section title={heading} id="explore-results">
          <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {feed.recipes.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} showCounts={!legacy} />)}
          </div>
        </Section>
      )}

      {feed.state === 'ok' && (query.cursor || feed.cursor) && feed.recipes.length > 0 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
          {query.cursor ? <Link className={pageLinkClassName} href={exploreHref({ ...query, cursor: undefined })}>First page</Link> : <span />}
          {feed.cursor && <Link className={pageLinkClassName} rel="next" href={exploreHref({ ...query, cursor: feed.cursor })}>Next page</Link>}
        </nav>
      )}
    </ExploreShell>
  );
}
