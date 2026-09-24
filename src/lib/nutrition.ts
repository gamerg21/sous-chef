/**
 * Recipe nutrition from pantry facts. Each linked pantry item may carry
 * nutrition per 100 g (entered by hand or from a barcode lookup); ingredient
 * amounts are converted to grams and summed. Weights convert exactly; volumes
 * assume water density and are flagged approximate; count units can't convert.
 */

export interface Nutrients {
  energyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarsG: number;
  fiberG: number;
  saltG: number;
}

export type NutrientKey = keyof Nutrients;
export type NutritionPer100g = Partial<Nutrients>;

export const NUTRIENT_FIELDS: Array<{ key: NutrientKey; label: string; unit: string }> = [
  { key: "energyKcal", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Carbs", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
  { key: "sugarsG", label: "Sugars", unit: "g" },
  { key: "fiberG", label: "Fiber", unit: "g" },
  { key: "saltG", label: "Salt", unit: "g" },
];

// Open Food Facts stores raw "nutriments"; hand entries use our own keys.
const OFF_KEYS: Record<NutrientKey, string> = {
  energyKcal: "energy-kcal_100g",
  proteinG: "proteins_100g",
  carbsG: "carbohydrates_100g",
  fatG: "fat_100g",
  sugarsG: "sugars_100g",
  fiberG: "fiber_100g",
  saltG: "salt_100g",
};

/** Normalizes either shape; returns undefined when no nutrient is known. */
export function readNutrition(raw: unknown): NutritionPer100g | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const result: NutritionPer100g = {};
  for (const { key } of NUTRIENT_FIELDS) {
    const value = source[key] ?? source[OFF_KEYS[key]];
    const number = typeof value === "string" ? Number(value) : value;
    if (typeof number === "number" && Number.isFinite(number) && number >= 0) result[key] = number;
  }
  return Object.keys(result).length ? result : undefined;
}

const GRAMS: Record<string, number> = {
  mg: 0.001, g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};
const MILLILITERS: Record<string, number> = {
  ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000,
  tsp: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892, tbsp: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  cup: 236.588, cups: 236.588, "fl oz": 29.5735, pt: 473.176, pint: 473.176, qt: 946.353, quart: 946.353,
  gal: 3785.41, gallon: 3785.41,
};

/** Grams for an amount, or null when the unit has no weight (e.g. "clove"). */
export function toGrams(quantity: number, unit?: string): { grams: number; approximate: boolean } | null {
  const key = unit?.trim().toLowerCase() ?? "";
  if (GRAMS[key]) return { grams: quantity * GRAMS[key], approximate: false };
  if (MILLILITERS[key]) return { grams: quantity * MILLILITERS[key], approximate: true };
  return null;
}

export type MissingReason = "not-linked" | "no-facts" | "no-amount" | "no-weight";

export interface RecipeNutrition {
  /** Totals for the whole recipe, from the ingredients that could be counted. */
  total: Nutrients;
  perServing: Nutrients;
  counted: string[];
  missing: Array<{ name: string; reason: MissingReason; pantryName?: string }>;
  approximate: boolean;
}

const zero = (): Nutrients => ({ energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, sugarsG: 0, fiberG: 0, saltG: 0 });

export function computeRecipeNutrition(
  ingredients: Array<{ name: string; quantity?: number; unit?: string; mapping?: { inventoryItemLabel: string } }>,
  pantry: Array<{ name: string; nutritionPer100g?: unknown; foodFacts?: { nutritionPer100g?: unknown } }>,
  servings = 1,
): RecipeNutrition {
  const factsByName = new Map<string, NutritionPer100g>();
  for (const item of pantry) {
    const key = item.name.trim().toLowerCase();
    // Hand-entered facts win over barcode data; any batch with facts will do.
    const facts = readNutrition(item.nutritionPer100g) ?? readNutrition(item.foodFacts?.nutritionPer100g);
    if (facts && (!factsByName.has(key) || readNutrition(item.nutritionPer100g))) factsByName.set(key, facts);
  }

  const result: RecipeNutrition = { total: zero(), perServing: zero(), counted: [], missing: [], approximate: false };
  for (const ingredient of ingredients) {
    const pantryName = ingredient.mapping?.inventoryItemLabel?.trim();
    if (!pantryName) { result.missing.push({ name: ingredient.name, reason: "not-linked" }); continue; }
    const facts = factsByName.get(pantryName.toLowerCase());
    if (!facts) { result.missing.push({ name: ingredient.name, reason: "no-facts", pantryName }); continue; }
    if (ingredient.quantity == null || !(ingredient.quantity > 0)) { result.missing.push({ name: ingredient.name, reason: "no-amount", pantryName }); continue; }
    const weight = toGrams(ingredient.quantity, ingredient.unit);
    if (!weight) { result.missing.push({ name: ingredient.name, reason: "no-weight", pantryName }); continue; }
    for (const { key } of NUTRIENT_FIELDS) result.total[key] += ((facts[key] ?? 0) * weight.grams) / 100;
    result.approximate ||= weight.approximate;
    result.counted.push(ingredient.name);
  }
  const divisor = servings > 0 ? servings : 1;
  for (const { key } of NUTRIENT_FIELDS) result.perServing[key] = result.total[key] / divisor;
  return result;
}
