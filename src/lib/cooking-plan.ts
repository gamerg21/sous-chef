/** One deterministic allocation shared by the preview and inventory mutation. */
export interface CookingPlan {
  missingIngredients: { name: string; quantity?: number; unit?: string }[];
  checks: { name: string; reason: string }[];
  deductions: { id: string; name: string; quantity: number; unit?: string; remaining: number }[];
  availableCount: number;
  /** Pantry rows (by id) that a counted ingredient matches by name, measured or not. */
  uses?: string[];
}
type Ingredient = { id: string; name: string; quantity?: number; unit?: string; note?: string; mappingLabel?: string };
type Stock = { id: string; name: string; quantity?: number; unit?: string; expiresOn?: string };
type Unit = { labels: string[]; type: string; factor?: number };
const normalize = (value?: string) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const epsilon = 0.000001;
/**
 * Converted amounts within this share of a pantry item count as the whole item:
 * 453 g or 454 g of a 1 lb pack, or 240 ml of a 1 cup carton, uses it up instead
 * of leaving a sliver or asking for a little more. Only applies across units,
 * where factors and recipes round.
 */
const conversionTolerance = 0.02;

/** Unit lookup and conversion over the kitchen's unit catalog; null when units can't be compared. */
export function unitConverter(catalog: Unit[]) {
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
  return { units, convert };
}

export function planCooking(ingredients: Ingredient[], stock: Stock[], catalog: Unit[]): CookingPlan {
  const { units, convert } = unitConverter(catalog);
  const remaining = stock.map(item => ({ ...item, quantity: item.quantity ?? 0, original: item.quantity ?? 0 }))
    .sort((a, b) => (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999'));
  const plan: CookingPlan = { missingIngredients: [], checks: [], deductions: [], availableCount: 0 };
  const uses = new Set<string>();
  if (!ingredients.length) plan.checks.push({ name: 'Recipe', reason: 'This recipe has no ingredients. Add them before tracking inventory automatically.' });
  for (const ingredient of ingredients) {
    if (/\boptional\b|to taste/i.test(ingredient.note ?? '') || units.get(normalize(ingredient.unit))?.type === 'qualitative' || /^(to taste|as needed)$/i.test(ingredient.unit ?? '')) continue;
    const matches = remaining.filter(item => normalize(item.name) === normalize(ingredient.mappingLabel || ingredient.name));
    for (const item of matches) if (item.original > epsilon) uses.add(item.id);
    const missing = (quantity?: number) => plan.missingIngredients.push({ name: ingredient.name, quantity, unit: ingredient.unit });
    if (ingredient.quantity == null || !Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0) {
      plan.checks.push({ name: ingredient.name, reason: 'Recipe amount is unspecified. Check it manually; inventory will not be deducted.' });
      if (!matches.some(item => item.quantity > epsilon)) missing();
      continue;
    }
    let needed = ingredient.quantity;
    const compatible = matches.filter(item => convert(1, ingredient.unit, item.unit) !== null);
    const drawnFrom: typeof remaining = [];
    for (const item of compatible) {
      if (needed <= epsilon) break;
      if (item.quantity > epsilon) drawnFrom.push(item);
      const wanted = convert(needed, ingredient.unit, item.unit)!;
      if (units.get(normalize(ingredient.unit)) !== units.get(normalize(item.unit)) && Math.abs(wanted - item.quantity) <= item.quantity * conversionTolerance) {
        item.quantity = 0;
        needed = 0;
        break;
      }
      const taken = Math.min(wanted, item.quantity);
      item.quantity -= taken;
      needed -= convert(taken, item.unit, ingredient.unit)!;
    }
    if (needed > epsilon) {
      const uncertain = matches.some(item => item.quantity > epsilon && convert(1, ingredient.unit, item.unit) === null);
      if (uncertain) plan.checks.push({ name: ingredient.name, reason: `Cannot compare the remaining ${Number(needed.toPrecision(6))} ${ingredient.unit ?? 'units'} with the pantry units. Check and adjust that stock manually.` });
      else missing(Number(needed.toPrecision(6)));
    } else {
      plan.availableCount++;
      // Stock goes soonest-expiring first, but a batch in units the recipe can't be compared with is skipped.
      const passedOver = matches.find(item => item.expiresOn && item.quantity > epsilon && !compatible.includes(item) && drawnFrom.some(other => !other.expiresOn || other.expiresOn > item.expiresOn!));
      if (passedOver) {
        const amount = [Number(passedOver.quantity.toPrecision(6)), passedOver.unit].filter(Boolean).join(' ');
        plan.checks.push({ name: ingredient.name, reason: `The ${amount} expiring ${passedOver.expiresOn} can't be compared with the recipe's ${ingredient.unit ?? 'amount'}, so later stock is used instead. Use the expiring one if you can and adjust the pantry by hand.` });
      }
    }
  }
  plan.uses = [...uses];
  plan.deductions = remaining.filter(item => item.original - item.quantity > epsilon).map(item => ({ id: item.id, name: item.name, quantity: item.original - item.quantity, unit: item.unit, remaining: item.quantity }));
  return plan;
}

/** Multiplies measured amounts, e.g. to cook a recipe for more servings than it's written for. */
export function scaleIngredients<T extends Ingredient>(ingredients: T[], factor: number): T[] {
  if (factor === 1) return ingredients;
  return ingredients.map(ingredient => ingredient.quantity == null ? ingredient : { ...ingredient, quantity: Number((ingredient.quantity * factor).toPrecision(6)) });
}

/**
 * Folds shortages of the same food into one line per comparable unit, converting
 * amounts into the first unit seen (250 ml + 1 l = 1250 ml). Units that can't be
 * compared stay separate. An unspecified amount joins a measured line of the same
 * food rather than adding its own.
 */
export function combineShortages(missing: CookingPlan['missingIngredients'], catalog: Unit[]): CookingPlan['missingIngredients'] {
  const { convert } = unitConverter(catalog);
  const combined: CookingPlan['missingIngredients'] = [];
  for (const item of missing) {
    const sameFood = combined.filter(line => normalize(line.name) === normalize(item.name));
    if (item.quantity == null) {
      if (!sameFood.length) combined.push({ ...item });
      continue;
    }
    const unmeasured = sameFood.find(line => line.quantity == null);
    const line = sameFood.find(line => line.quantity != null && convert(1, item.unit, line.unit) !== null);
    if (line) line.quantity = Number((line.quantity! + convert(item.quantity, item.unit, line.unit)!).toPrecision(6));
    else if (unmeasured) Object.assign(unmeasured, { quantity: item.quantity, unit: item.unit });
    else combined.push({ ...item });
  }
  return combined;
}

/**
 * Shortages for several recipes cooked from one pantry. All ingredients draw on
 * the same stock in turn, so what one meal uses isn't counted again for the next;
 * the remaining needs are then combined per food and unit.
 */
export function planShortages(recipes: Ingredient[][], stock: Stock[], catalog: Unit[]) {
  const ingredients = recipes.flat();
  if (!ingredients.length) return { missingIngredients: [], checks: [] };
  const plan = planCooking(ingredients, stock, catalog);
  return { missingIngredients: combineShortages(plan.missingIngredients, catalog), checks: plan.checks };
}
