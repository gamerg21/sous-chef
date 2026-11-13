// Compares a community recipe's ingredient names with what a kitchen has in
// stock. Names only: no amounts or units, so it answers "do we have some of
// this", not "do we have enough".
import type { PantryMatch } from './community-contract';

const IRREGULAR: Record<string, string> = { leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife', children: 'child', geese: 'goose', teeth: 'tooth' };
// Words that end in "s" in the singular.
const UNCOUNTABLE = new Set(['hummus', 'couscous', 'asparagus', 'molasses', 'swiss', 'citrus', 'schnapps', 'harissa', 'watercress', 'cress', 'bass', 'lemongrass', 'octopus', 'series', 'species']);

function singular(word: string): string {
  if (word.length < 4 || UNCOUNTABLE.has(word)) return word;
  if (IRREGULAR[word]) return IRREGULAR[word];
  // "berries", "cookies" and "cookie" all meet at one key.
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ie')) return `${word.slice(0, -2)}y`;
  if (/(oes|ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

/** Lowercase, unaccented, unpunctuated, singular: "Tomatoes, " → "tomato". */
export function ingredientKey(name: string): string {
  return name.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .split(' ').filter(Boolean).map(singular).join(' ');
}

/** Assumed to be in every kitchen, so they never count for or against a recipe. */
const ALWAYS_ON_HAND = new Set(['water', 'cold water', 'warm water', 'hot water', 'boiling water', 'ice water', 'salt', 'kosher salt', 'sea salt', 'table salt', 'fine salt', 'pepper', 'black pepper', 'ground pepper', 'ground black pepper', 'freshly ground black pepper', 'freshly ground pepper', 'salt and pepper'].map(ingredientKey));

/** The keys of the in-stock names, built once and reused for many recipes. */
export function pantryKeys(stockNames: Iterable<string>): Set<string> {
  const keys = new Set<string>();
  for (const name of stockNames) { const key = ingredientKey(name); if (key) keys.add(key); }
  return keys;
}

/**
 * How many of a recipe's distinct ingredients are in stock. Water, salt and
 * pepper are left out of both counts. `missing` keeps the recipe's own wording.
 */
export function matchPantry(ingredientNames: string[], stock: Set<string>): PantryMatch {
  const seen = new Set<string>();
  const missing: string[] = [];
  let have = 0;
  for (const name of ingredientNames) {
    const key = ingredientKey(name);
    if (!key || seen.has(key) || ALWAYS_ON_HAND.has(key)) continue;
    seen.add(key);
    if (stock.has(key)) have++; else missing.push(name.trim());
  }
  return { have, total: seen.size, missing };
}

/** Best match first: share of ingredients on hand, then how many are on hand. Stable. */
export function comparePantry(a: PantryMatch, b: PantryMatch): number {
  const share = (m: PantryMatch) => m.total ? m.have / m.total : 0;
  return share(b) - share(a) || b.have - a.have;
}
