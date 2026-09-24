/**
 * Amount parsing helpers for ingredient rows (unit-picker spec: basic
 * fraction support — "1/2" → 0.5, "1 1/2" → 1.5).
 */
export function parseAmount(input: string): number | null {
  const text = input.trim();
  if (!text) return null;

  // "1 1/2" — whole number plus fraction
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  // "1/2" — plain fraction
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Unit types whose amounts are optional (per unit-picker spec). */
export function amountOptionalForUnitType(
  unitType: string | null | undefined,
): boolean {
  return unitType === "qualitative";
}

// Abbreviations and symbols read the same for any amount ("2 tbsp", "500 g").
const INVARIANT_UNITS = new Set([
  "each", "count", "tsp", "tbsp", "fl oz", "pt", "qt", "gal", "ml", "l", "g", "kg",
  "oz", "lb", "lbs", "°f", "°c", "sec", "min", "hr", "pkg",
]);
const IRREGULAR_PLURALS: Record<string, string> = { leaf: "leaves", loaf: "loaves", knife: "knives", half: "halves" };

/**
 * Display form of a unit for an amount: "cup" → "cups" for 2, but "cup" for
 * 1 or ½. Units are stored singular so matching and conversion stay exact;
 * only what the reader sees changes. Phrases and abbreviations are left alone.
 */
export function unitLabel(unit: string | undefined, amount?: number | string | null): string {
  const text = unit?.trim() ?? "";
  if (!text) return "";
  const value = typeof amount === "string" ? parseAmount(amount) : amount;
  if (value == null || !Number.isFinite(value) || (value > 0 && value <= 1)) return text;
  const lower = text.toLowerCase();
  if (INVARIANT_UNITS.has(lower) || !/^[a-z]{3,}$/i.test(text) || lower.endsWith("s")) return text;
  if (IRREGULAR_PLURALS[lower]) return IRREGULAR_PLURALS[lower];
  if (/(ch|sh|x|z)$/i.test(text)) return `${text}es`;
  if (/[^aeiou]y$/i.test(text)) return `${text.slice(0, -1)}ies`;
  return `${text}s`;
}
