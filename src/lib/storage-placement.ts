/**
 * Guesses where a food is kept from its name, then its category: "milk" goes
 * in the fridge, "evaporated milk" in the pantry, "ice cream" in the freezer.
 * Returns nothing when it has no opinion, so the caller can fall back.
 *
 * The foods are in `food-storage.json`. iOS reads an identical copy,
 * `ios/SousChef/Domain/FoodStorage.json`, with the same matching; a test
 * keeps the two files the same.
 */

import storage from "./food-storage.json";

export type PlacementId = "pantry" | "fridge" | "freezer";

export interface Placement {
  location: PlacementId;
  /** What decided it: the words matched in the name ("milk"), or the category. */
  reason: string;
  basis: "name" | "category";
}

type Term = { text: string; location: PlacementId; parts: string[]; exact: boolean };

/** "Half & Half, 2%" → ["half", "and", "half", "2%"]. */
export function foodWords(text: string): string[] {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase()
    .replace(/&/g, " and ").split(/[^a-z0-9%]+/).filter(Boolean);
}

/** One spelling for a word and its simple plural; the same folding as iOS's `FoodWords.stem`. */
export function foodStem(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) word = word.slice(0, -1);
  if (word.length > 4 && word.endsWith("e")) word = word.slice(0, -1);
  if (word.length > 3 && word.endsWith("y")) word = `${word.slice(0, -1)}i`;
  return word;
}

const PLACES: PlacementId[] = ["freezer", "fridge", "pantry"];

// "=" in front of a term matches the spelling exactly: "=greens" isn't "green".
function terms(lists: Record<string, string[]>): Term[] {
  return PLACES.flatMap((location) => (lists[location] ?? []).map((raw) => {
    const exact = raw.startsWith("=");
    const text = exact ? raw.slice(1) : raw;
    return { text, location, exact, parts: exact ? foodWords(text) : foodWords(text).map(foodStem) };
  }));
}

// How the food is sold ("frozen", "canned") settles it wherever it appears.
const MODIFIERS = terms(storage.modifiers);
const FOODS = terms(storage.foods);
// "Tuna in water", "yogurt with granola": the food comes before these.
const PREPOSITIONS = new Set(["with", "in", "for", "from"]);

/** The index just past the last place the term appears, or -1. */
function lastEnd(term: Term, words: string[], stems: string[]): number {
  const haystack = term.exact ? words : stems;
  for (let start = haystack.length - term.parts.length; start >= 0; start--) {
    if (term.parts.every((part, offset) => haystack[start + offset] === part)) return start + term.parts.length;
  }
  return -1;
}

/**
 * English puts the food last ("chicken soup" is soup, "egg noodles" are
 * noodles), so the term ending latest wins; of two ending together the longer
 * ("peanut butter" over "butter"), then the exact spelling.
 */
function bestFood(words: string[], stems: string[]): Term | undefined {
  let best: Term | undefined;
  let bestEnd = -1;
  for (const term of FOODS) {
    const end = lastEnd(term, words, stems);
    if (end < 0) continue;
    const better = !best || end > bestEnd
      || (end === bestEnd && (term.parts.length > best.parts.length
        || (term.parts.length === best.parts.length && term.exact && !best.exact)));
    if (better) { best = term; bestEnd = end; }
  }
  return best;
}

function matchName(name: string): Term | undefined {
  const words = foodWords(name);
  if (words.length === 0) return undefined;
  if (words.length === 1 && words[0] === "ice") return { text: "ice", location: "freezer", parts: ["ice"], exact: true };
  const stems = words.map(foodStem);
  const modifier = MODIFIERS.find((term) => lastEnd(term, words, stems) >= 0);
  if (modifier) return modifier;
  const cut = words.findIndex((word) => PREPOSITIONS.has(word));
  return (cut > 0 ? bestFood(words.slice(0, cut), stems.slice(0, cut)) : undefined) ?? bestFood(words, stems);
}

// The app's category options (INVENTORY_CATEGORY_OPTIONS). "Beverages" and
// "Other" could be anywhere, so they give no answer.
const CATEGORY_PLACES: Record<string, PlacementId> = {
  dairy: "fridge",
  "meat & seafood": "fridge",
  produce: "fridge",
  frozen: "freezer",
  pantry: "pantry",
  bakery: "pantry",
  "canned goods": "pantry",
  "grains & rice": "pantry",
  "pasta & noodles": "pantry",
  "spices & seasonings": "pantry",
  "condiments & sauces": "pantry",
  snacks: "pantry",
};

/** Where a food goes and why, or undefined when neither its name nor its category says. */
export function matchPlacement(name: string, category?: string): Placement | undefined {
  const term = matchName(name);
  if (term) return { location: term.location, reason: term.text, basis: "name" };
  const label = category?.trim();
  const place = label ? CATEGORY_PLACES[label.toLowerCase()] : undefined;
  return place && label ? { location: place, reason: label, basis: "category" } : undefined;
}

/** Where a food goes: its name first, then its category. */
export function suggestPlacement(name: string, category?: string): PlacementId | undefined {
  return matchPlacement(name, category)?.location;
}

/** Households name their own locations; this reads which kind one is from its name. */
export function locationKind(name: string): PlacementId {
  const lower = name.toLowerCase();
  if (lower.includes("freez")) return "freezer";
  if (lower.includes("fridge") || lower.includes("refrig")) return "fridge";
  return "pantry";
}

/** The household location of a kind, preferring one actually called "Pantry" for the pantry. */
export function locationOfKind<T extends { name: string }>(locations: T[], kind: PlacementId | undefined): T | undefined {
  if (!kind) return undefined;
  const matches = locations.filter((location) => locationKind(location.name) === kind);
  return matches.find((location) => location.name.toLowerCase().includes(kind)) ?? matches[0];
}
