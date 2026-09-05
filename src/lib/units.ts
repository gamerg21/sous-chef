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
