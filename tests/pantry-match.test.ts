import { expect, test } from 'vitest';
import { comparePantry, ingredientKey, matchPantry, pantryKeys } from '../src/lib/pantry-match';

test('keys ignore case, accents, punctuation and plurals', () => {
  for (const [a, b] of [['Tomatoes', 'tomato'], ['  Cherry-Tomatoes! ', 'cherry tomato'], ['Jalapeños', 'jalapeno'], ['Berries', 'berry'], ['Cookies', 'cookie'], ['Peaches', 'peach'], ['Bay leaves', 'bay leaf'], ['Eggs', 'EGG'], ['Salt & Pepper', 'salt and pepper']]) expect(ingredientKey(a)).toBe(ingredientKey(b));
  for (const name of ['hummus', 'couscous', 'asparagus', 'molasses', 'swiss chard', 'watercress', 'peas']) expect(ingredientKey(name)).toBe(ingredientKey(ingredientKey(name)));
  expect(ingredientKey('hummus')).toBe('hummus');
  expect(ingredientKey('glass noodles')).toBe('glass noodle');
  expect(ingredientKey('bell pepper')).not.toBe(ingredientKey('pepper'));
  expect(ingredientKey('…')).toBe('');
});

test('counts distinct ingredients on hand and leaves out water, salt and pepper', () => {
  const stock = pantryKeys(['Egg', 'olive oil', 'Bell Peppers', '']);
  expect(matchPantry(['Eggs', 'eggs', 'Olive Oil', ' Saffron ', 'Salt', 'Black pepper', 'Water', 'bell pepper', ''], stock)).toEqual({ have: 3, total: 4, missing: ['Saffron'] });
  expect(matchPantry(['salt', 'water'], stock)).toEqual({ have: 0, total: 0, missing: [] });
  // Stock named like a staple still isn't needed for the count.
  expect(matchPantry(['Sea salt'], pantryKeys(['sea salt']))).toEqual({ have: 0, total: 0, missing: [] });
});

test('orders by share on hand, then by how many', () => {
  const matches = [{ have: 1, total: 2, missing: [] }, { have: 0, total: 0, missing: [] }, { have: 2, total: 2, missing: [] }, { have: 5, total: 5, missing: [] }, { have: 3, total: 6, missing: [] }, { have: 0, total: 3, missing: [] }];
  expect([...matches].sort(comparePantry).map(m => `${m.have}/${m.total}`)).toEqual(['5/5', '2/2', '3/6', '1/2', '0/0', '0/3']);
});
