import type { PantrySnapshotItem, Recipe, RecipeIngredient } from './types'

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

export function formatMinutes(total?: number): string {
  if (!total || total <= 0) return '—'
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

export function pantryIndex(pantry: PantrySnapshotItem[] = []): Record<string, PantrySnapshotItem> {
  const idx: Record<string, PantrySnapshotItem> = {}
  for (const p of pantry) idx[normalizeKey(p.name)] = p
  return idx
}

export type IngredientMatchStatus = 'in-stock' | 'missing' | 'unmapped'

export function ingredientMatchStatus(
  ingredient: RecipeIngredient,
  pantry: PantrySnapshotItem[] = []
): IngredientMatchStatus {
  const mapping = ingredient.mapping?.inventoryItemLabel
  if (!mapping) return 'unmapped'
  const idx = pantryIndex(pantry)
  return idx[normalizeKey(mapping)] ? 'in-stock' : 'missing'
}

export function recipeMatchSummary(recipe: Recipe, pantry: PantrySnapshotItem[] = []) {
  let inStock = 0
  let missing = 0
  let unmapped = 0

  for (const ing of recipe.ingredients) {
    const s = ingredientMatchStatus(ing, pantry)
    if (s === 'in-stock') inStock += 1
    else if (s === 'missing') missing += 1
    else unmapped += 1
  }

  return { inStock, missing, unmapped, total: recipe.ingredients.length }
}


