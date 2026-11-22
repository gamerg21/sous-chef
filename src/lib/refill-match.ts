/**
 * Finds the inventory item a new purchase should refill, so buying another
 * brand of milk tops up "Milk" instead of adding a second row. Mirrored on
 * iOS; keep the two in step.
 */
import { ingredientKey } from "./pantry-match";
import type { NutritionPer100g } from "./nutrition";

export interface RefillItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  barcode?: string;
  expiresOn?: string;
  foodFacts?: { brand?: string };
  createdAt?: number;
}

export interface RefillQuery {
  name: string;
  /** As Open Food Facts lists it: "Fairlife, The Coca-Cola Company". */
  brand?: string;
  barcode?: string;
  /** The unit being added; an item still in stock is only topped up in its own unit. */
  unit?: string;
}

export interface RefillMatch<T extends RefillItem> {
  item: T;
  /** strong: same barcode or same name. weak: same food once qualifiers are dropped. */
  confidence: "strong" | "weak";
  /** The item is out of stock (quantity 0). */
  out: boolean;
  /** Whether refilling should be the default: a sure match that is out. */
  defaultOn: boolean;
}

// Words that describe a food without changing which food it is.
const QUALIFIERS = new Set([
  "organic", "whole", "fresh", "natural", "original", "classic", "plain",
  "small", "medium", "large", "extra", "jumbo",
  "low", "reduced", "fat", "free", "range", "lowfat", "nonfat", "skim", "salted", "unsalted",
  "1", "2", "percent",
].map(ingredientKey));

// Extra words that make it a different food: "oat milk" is not "milk".
const DIFFERENT_FOOD = new Set([
  "oat", "almond", "soy", "coconut", "rice", "cashew", "peanut", "hazelnut", "goat", "sheep",
  "chocolate", "condensed", "evaporated", "powdered", "powder", "ice", "sour",
  "milk", "cream", "butter", "cheese", "sauce", "broth", "stock", "soup", "juice", "oil", "flour",
  "paste", "bread", "chips", "crackers", "noodles", "vinegar", "syrup",
].map(ingredientKey));

/** The name's key without a brand at its start or end: "Fairlife Whole Milk" → "whole milk". */
function withoutBrand(key: string, brand: string | undefined): string {
  const brands = [brand ?? "", ...(brand?.split(",") ?? [])].map(ingredientKey).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const words of brands) {
    if (key.startsWith(`${words} `)) return key.slice(words.length + 1);
    if (key.endsWith(` ${words}`)) return key.slice(0, -words.length - 1);
  }
  return key;
}

function core(key: string): string[] {
  return key.split(" ").filter((word) => word && !QUALIFIERS.has(word));
}

/** One list's words all appear in the other, and the leftovers don't name another food. */
function sameFood(a: string[], b: string[]): boolean {
  const [small, large] = a.length <= b.length ? [a, b] : [b, a];
  if (!small.length || !small.every((word) => large.includes(word))) return false;
  return !large.some((word) => !small.includes(word) && DIFFERENT_FOOD.has(word));
}

/**
 * The best existing item to refill. Items that are out are offered on any
 * match; items in stock only on a strong match in the same unit. Weak matches
 * that point at different foods ("Oat milk" and "Whole milk") give no answer.
 */
export function findRefill<T extends RefillItem>(query: RefillQuery, items: T[]): RefillMatch<T> | undefined {
  const barcode = query.barcode?.trim();
  const key = withoutBrand(ingredientKey(query.name), query.brand);
  const words = core(key);
  const unit = query.unit?.trim().toLowerCase();

  const strong: T[] = [];
  const weak: Array<{ item: T; food: string }> = [];
  for (const item of items) {
    const itemKey = ingredientKey(item.name);
    const itemPlain = withoutBrand(itemKey, item.foodFacts?.brand);
    if ((barcode && item.barcode?.trim() === barcode) || (key && (key === itemKey || key === itemPlain))) {
      strong.push(item);
      continue;
    }
    const itemWords = core(itemPlain);
    if (key && sameFood(words, itemWords)) weak.push({ item, food: itemWords.join(" ") });
  }

  const out = (item: T) => !(item.quantity > 0);
  const newest = (a: T, b: T) => Number(out(b)) - Number(out(a)) || (b.createdAt ?? 0) - (a.createdAt ?? 0);
  const sure = strong.filter((item) => out(item) || !unit || item.unit.trim().toLowerCase() === unit).sort(newest)[0];
  if (sure) return { item: sure, confidence: "strong", out: out(sure), defaultOn: out(sure) };
  if (new Set(weak.map((match) => match.food)).size > 1) return undefined;
  const likely = weak.map((match) => match.item).filter(out).sort(newest)[0];
  return likely ? { item: likely, confidence: "weak", out: true, defaultOn: false } : undefined;
}

export interface RefillForm {
  quantity: number;
  unit: string;
  locationId: string;
  /** The user picked the location in the form, rather than it being suggested. */
  locationChosen?: boolean;
  expiresOn?: string;
  category?: string;
  notes?: string;
  barcode?: string;
  nutritionPer100g?: NutritionPer100g | null;
}

export interface RefillUpdate {
  id: string;
  quantity?: number;
  quantityDelta?: number;
  unit?: string;
  locationId?: string;
  expiresOn?: string;
  category?: string;
  notes?: string;
  barcode?: string;
  nutritionPer100g?: NutritionPer100g;
}

/**
 * The inventory update that refills an item. One that is out takes the new
 * purchase's amount, unit, place and details and keeps its name. One still in
 * stock gains the amount as a delta and keeps its own date and barcode.
 */
export function refillUpdate(existing: Pick<RefillItem, "id" | "quantity" | "barcode" | "expiresOn">, form: RefillForm): RefillUpdate {
  const filled = (value: string | undefined) => value?.trim() || undefined;
  const update: RefillUpdate = { id: existing.id };
  if (existing.quantity > 0) {
    update.quantityDelta = form.quantity;
    if (form.locationChosen) update.locationId = form.locationId;
    if (!filled(existing.expiresOn)) update.expiresOn = filled(form.expiresOn);
    if (!filled(existing.barcode)) update.barcode = filled(form.barcode);
  } else {
    update.quantity = form.quantity;
    update.unit = form.unit;
    update.locationId = form.locationId;
    update.expiresOn = filled(form.expiresOn);
    update.category = filled(form.category);
    update.notes = filled(form.notes);
    update.barcode = filled(form.barcode);
    if (form.nutritionPer100g) update.nutritionPer100g = form.nutritionPer100g;
  }
  return Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)) as unknown as RefillUpdate;
}
