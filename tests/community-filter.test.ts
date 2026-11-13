import { expect, test } from 'vitest';
import { isObjectionable, snapshotTexts } from '../src/lib/community-filter';
test('filters whole words and plain plurals, ignoring case and accents', () => {
  expect(isObjectionable('A lovely tomato pasta')).toBe(false);
  expect(isObjectionable('Scunthorpe classic', 'cocktail shrimp', 'assorted bass')).toBe(false);
  expect(isObjectionable('what the FUCK')).toBe(true);
  expect(isObjectionable('fine', undefined, 'two shíts')).toBe(true);
});
test('collects every text field of a snapshot', () => {
  expect(snapshotTexts({ title: 'T', description: 'D', tags: ['a'], ingredients: [{ name: 'i', note: 'n' }], steps: [{ text: 's' }] })).toEqual(['T', 'D', 'a', 'i', 'n', 's']);
});
