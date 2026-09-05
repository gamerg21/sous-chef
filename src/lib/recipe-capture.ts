import { parseAmount } from './units'
import type { Recipe, RecipeIngredient } from '../components/recipes/types'

const fractions: Record<string, string> = { '¼':'1/4', '½':'1/2', '¾':'3/4', '⅓':'1/3', '⅔':'2/3', '⅛':'1/8', '⅜':'3/8', '⅝':'5/8', '⅞':'7/8' }
const unitPattern = /^(fl\s*oz|fluid ounces?|tablespoons?|teaspoons?|milliliters?|liters?|kilograms?|grams?|ounces?|pounds?|cups?|tbsp|tsp|ml|kg|oz|lb|g|l|each|count|cloves?|slices?|cans?|pinches?)\.?\s+(.+)$/i

export function captureIngredient(line: string, index: number): RecipeIngredient {
  const original = line.replace(/^\s*[-•*]\s*/, '').trim()
  const normalized = original.replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2').replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, value => fractions[value])
  const match = normalized.match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s+(.+)$/)
  const quantity = match ? parseAmount(match[1]) : null
  if (!match || quantity == null || quantity <= 0) return { id: `ingredient-${index}`, name: original }
  const unit = match[2].match(unitPattern)
  return { id: `ingredient-${index}`, name: unit ? unit[2] : match[2], quantity, unit: unit ? unit[1].toLowerCase() : 'each' }
}

/** Local, deterministic capture: original text stays in notes for review. */
export function captureRecipe(text: string, sourceUrl?: string): Recipe {
  if (text.length > 50000) throw new Error('Paste a recipe under 50,000 characters.')
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error('Paste a recipe first.')
  const ingredientStart = lines.findIndex(line => /^ingredients?\s*:?(?:\s*\([^)]*\))?$/i.test(line))
  const stepStart = lines.findIndex((line, index) => index > ingredientStart && /^(instructions?|directions?|method|steps?|preparation)\s*:?$/i.test(line))
  if (ingredientStart < 1 || stepStart <= ingredientStart + 1 || stepStart === lines.length - 1) throw new Error('Include a title, an Ingredients heading, and an Instructions heading, each on its own line.')
  const ingredientLines = lines.slice(ingredientStart + 1, stepStart)
  const steps = lines.slice(stepStart + 1)
  if (ingredientLines.length > 100 || steps.length > 100) throw new Error('Use up to 100 ingredients and 100 instruction lines.')
  let url: string | undefined
  if (sourceUrl?.trim()) {
    const parsed = new URL(sourceUrl.trim())
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Use a public http or https source link.')
    url = parsed.href
  }
  return {
    id: 'captured-draft', title: lines[0], description: lines.slice(1, ingredientStart).join('\n') || undefined,
    visibility: 'private', sourceUrl: url,
    ingredients: ingredientLines.map(captureIngredient),
    steps: steps.map((line, index) => ({ id: `step-${index}`, text: line.replace(/^\d+[.)]\s+/, '') })),
    notes: `Captured text — check ingredient names, quantities, and units before cooking.\n\n${text.trim()}`,
  }
}
