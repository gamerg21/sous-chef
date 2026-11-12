// Pure helpers for the public explore pages: reading the query string,
// building links, and formatting what a recipe shows.
import type { SortOrder } from '@/lib/community-contract';

export const EXPLORE_SORTS: readonly { value: SortOrder; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'hot', label: 'Trending' },
  { value: 'top', label: 'Top' },
];

export type ExploreQuery = { search?: string; sort: SortOrder; tag?: string; cursor?: string };
type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/** The explore page's state from its query string. Unknown or oversized values are dropped, never passed on. */
export function exploreQuery(params: RawParams): ExploreQuery {
  const search = first(params.q).slice(0, 200);
  const sortValue = first(params.sort);
  const sort = EXPLORE_SORTS.find(option => option.value === sortValue)?.value ?? 'new';
  const tag = first(params.tag);
  const cursor = first(params.cursor);
  return {
    sort,
    ...(search ? { search } : {}),
    // The community doesn't combine search with a tag; search wins.
    ...(!search && tag && tag.length <= 100 ? { tag } : {}),
    ...(cursor && cursor.length <= 2000 ? { cursor } : {}),
  };
}

/** A link to the explore page in the given state. */
export function exploreHref(query: Partial<ExploreQuery> = {}): string {
  const params = new URLSearchParams();
  if (query.search) params.set('q', query.search);
  if (query.tag && !query.search) params.set('tag', query.tag);
  if (query.sort && query.sort !== 'new') params.set('sort', query.sort);
  if (query.cursor) params.set('cursor', query.cursor);
  const text = params.toString();
  return text ? `/explore?${text}` : '/explore';
}

export const recipeHref = (id: string) => `/explore/recipes/${encodeURIComponent(id)}`;
export const downloadHref = (id: string) => `/api/community/recipes/${encodeURIComponent(id)}`;

/** "1 like", "12 likes". */
export const countLabel = (count: number, singular: string, plural = `${singular}s`) => `${count.toLocaleString('en')} ${count === 1 ? singular : plural}`;

/** A quantity without float noise: 0.333333 → "0.33", 2 → "2". */
export function quantityLabel(quantity: number | undefined): string {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return '';
  return String(Number(quantity.toFixed(2)));
}

/** "45 min", "1 hr", "1 hr 30 min". */
export function durationLabel(minutes: number | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return '';
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60), rest = total % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** A calendar date that reads the same on the server and for every visitor. */
export function dateLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en', { dateStyle: 'medium', timeZone: 'UTC' });
}

/** Search-result description: one line, at most 200 characters. */
export function summaryLine(text: string | undefined, fallback: string): string {
  const line = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return fallback;
  return line.length > 200 ? `${line.slice(0, 199).trimEnd()}…` : line;
}
