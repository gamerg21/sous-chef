import type { Recipe } from '@/components/recipes/types'

/** UI IDs and display timestamps are not part of the mutation contract. */
export function recipeCreatePayload(recipe: Recipe) {
  return {
    title: recipe.title, description: recipe.description, photoUrl: recipe.photoUrl,
    tags: recipe.tags, visibility: recipe.visibility, servings: recipe.servings,
    totalTimeMinutes: recipe.totalTimeMinutes, caloriesKcal: recipe.caloriesKcal,
    proteinGrams: recipe.proteinGrams, carbsGrams: recipe.carbsGrams, fatGrams: recipe.fatGrams,
    sourceUrl: recipe.sourceUrl, notes: recipe.notes,
    ingredients: recipe.ingredients.map(ingredient => ({ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit, note: ingredient.note, mapping: ingredient.mapping })),
    steps: recipe.steps.map(step => ({ text: step.text })),
  }
}
export function recipeUpdatePayload(recipe: Recipe) {
  const payload = recipeCreatePayload(recipe)
  return { ...payload, description: payload.description ?? null, photoUrl: payload.photoUrl ?? null,
    tags: payload.tags ?? [], servings: payload.servings ?? null, totalTimeMinutes: payload.totalTimeMinutes ?? null,
    caloriesKcal: payload.caloriesKcal ?? null, proteinGrams: payload.proteinGrams ?? null,
    carbsGrams: payload.carbsGrams ?? null, fatGrams: payload.fatGrams ?? null,
    sourceUrl: payload.sourceUrl ?? null, notes: payload.notes ?? null }
}
