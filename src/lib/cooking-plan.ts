/** One deterministic allocation shared by the preview and inventory mutation. */
export interface CookingPlan {
  missingIngredients: { name: string; quantity?: number; unit?: string }[];
  checks: { name: string; reason: string }[];
  deductions: { id: string; name: string; quantity: number; unit?: string; remaining: number }[];
  availableCount: number;
}
type Ingredient = { id: string; name: string; quantity?: number; unit?: string; note?: string; mappingLabel?: string };
type Stock = { id: string; name: string; quantity?: number; unit?: string; expiresOn?: string };
type Unit = { labels: string[]; type: string; factor?: number };
const normalize = (value?: string) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const epsilon = 0.000001;

export function planCooking(ingredients: Ingredient[], stock: Stock[], catalog: Unit[]): CookingPlan {
  const units = new Map<string, Unit>();
  for (const unit of catalog) for (const label of unit.labels) if (label) units.set(normalize(label), unit);
  function convert(quantity: number, from?: string, to?: string): number | null {
    const a = normalize(from), b = normalize(to);
    if (a === b) return quantity;
    const source = units.get(a), target = units.get(b);
    if (!source || !target || source.type !== target.type) return null;
    if (source === target) return quantity;
    return source.factor && target.factor ? quantity * source.factor / target.factor : null;
  }
  const remaining = stock.map(item => ({ ...item, quantity: item.quantity ?? 0, original: item.quantity ?? 0 }))
    .sort((a, b) => (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999'));
  const plan: CookingPlan = { missingIngredients: [], checks: [], deductions: [], availableCount: 0 };
  if (!ingredients.length) plan.checks.push({ name: 'Recipe', reason: 'This recipe has no ingredients. Add them before tracking inventory automatically.' });
  for (const ingredient of ingredients) {
    if (/\boptional\b|to taste/i.test(ingredient.note ?? '') || units.get(normalize(ingredient.unit))?.type === 'qualitative' || /^(to taste|as needed)$/i.test(ingredient.unit ?? '')) continue;
    const matches = remaining.filter(item => normalize(item.name) === normalize(ingredient.mappingLabel || ingredient.name));
    const missing = (quantity?: number) => plan.missingIngredients.push({ name: ingredient.name, quantity, unit: ingredient.unit });
    if (ingredient.quantity == null || !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) {
      plan.checks.push({ name: ingredient.name, reason: 'Recipe amount is unspecified. Check it manually; inventory will not be deducted.' });
      if (!matches.some(item => item.quantity > epsilon)) missing();
      continue;
    }
    let needed = ingredient.quantity;
    const compatible = matches.filter(item => convert(1, ingredient.unit, item.unit) !== null);
    for (const item of compatible) {
      if (needed <= epsilon) break;
      const used = Math.min(convert(needed, ingredient.unit, item.unit)!, item.quantity);
      item.quantity -= used;
      needed -= convert(used, item.unit, ingredient.unit)!;
    }
    if (needed > epsilon) {
      const uncertain = matches.some(item => item.quantity > epsilon && convert(1, ingredient.unit, item.unit) === null);
      if (uncertain) plan.checks.push({ name: ingredient.name, reason: `Cannot compare the remaining ${Number(needed.toPrecision(6))} ${ingredient.unit ?? 'units'} with the pantry units. Check and adjust that stock manually.` });
      else missing(Number(needed.toPrecision(6)));
    } else plan.availableCount++;
  }
  plan.deductions = remaining.filter(item => item.original - item.quantity > epsilon).map(item => ({ id: item.id, name: item.name, quantity: item.original - item.quantity, unit: item.unit, remaining: item.quantity }));
  return plan;
}
