import { expect, test } from 'vitest';
import { countLabel, dateLabel, downloadHref, durationLabel, exploreHref, exploreQuery, quantityLabel, recipeHref, summaryLine } from '../src/app/explore/query';

test('reads the explore query string defensively', () => {
  expect(exploreQuery({})).toEqual({ sort: 'new' });
  expect(exploreQuery({ q: '  pasta ', sort: 'top', tag: 'dinner', cursor: 'abc' })).toEqual({ sort: 'top', search: 'pasta', cursor: 'abc' });
  expect(exploreQuery({ sort: 'evil', tag: ['Dinner', 'x'] })).toEqual({ sort: 'new', tag: 'Dinner' });
  expect(exploreQuery({ sort: 'hot', tag: 'x'.repeat(101), cursor: 'c'.repeat(2001) })).toEqual({ sort: 'hot' });
  expect(exploreQuery({ q: 'y'.repeat(300) }).search).toHaveLength(200);
});
test('builds links that round-trip', () => {
  expect(exploreHref()).toBe('/explore');
  expect(exploreHref({ sort: 'new' })).toBe('/explore');
  expect(exploreHref({ tag: 'Sunday roast & more', sort: 'hot', cursor: 'a/b?c' })).toBe('/explore?tag=Sunday+roast+%26+more&sort=hot&cursor=a%2Fb%3Fc');
  expect(exploreHref({ search: 'soup', tag: 'ignored' })).toBe('/explore?q=soup');
  const query = { sort: 'top' as const, tag: 'Dinner', cursor: 'next' };
  expect(exploreQuery(Object.fromEntries(new URL(exploreHref(query), 'http://x').searchParams))).toEqual(query);
  expect(recipeHref('a/b c')).toBe('/explore/recipes/a%2Fb%20c');
  expect(downloadHref('a/b')).toBe('/api/community/recipes/a%2Fb');
});
test('formats counts, amounts, durations, dates and summaries', () => {
  expect([countLabel(0, 'like'), countLabel(1, 'like'), countLabel(1200, 'cook')]).toEqual(['0 likes', '1 like', '1,200 cooks']);
  expect([quantityLabel(undefined), quantityLabel(2), quantityLabel(1 / 3), quantityLabel(0.5), quantityLabel(Number.NaN)]).toEqual(['', '2', '0.33', '0.5', '']);
  expect([durationLabel(undefined), durationLabel(0), durationLabel(45), durationLabel(60), durationLabel(95)]).toEqual(['', '', '45 min', '1 hr', '1 hr 35 min']);
  expect(dateLabel('2026-11-03T23:30:00.000Z')).toBe('Nov 3, 2026');
  expect(dateLabel('nonsense')).toBe('');
  expect(summaryLine('  A\n\n good   soup ', 'fallback')).toBe('A good soup');
  expect(summaryLine(undefined, 'fallback')).toBe('fallback');
  expect(summaryLine('x'.repeat(300), 'fallback')).toHaveLength(200);
});
