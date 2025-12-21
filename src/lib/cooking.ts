/**
 * Cooking & Shopping utilities
 * Handles cookability matching logic
 */

export interface PantrySnapshotItem {
  id: string
  name: string
  quantity?: number
  unit?: string
}

export interface RecipeIngredient {
  id: string
  name: string
  quantity?: number
  unit?: string
  note?: string
  mapping?: {
    inventoryItemLabel: string
    locationHint?: string
    suggested?: boolean
  }
}

export interface RecipeCookability {
  missingCount: number
  missingLabels: string[]
  availableCount: number
}

function normalizeLabel(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
}

/**
 * Computes cookability for a recipe based on pantry snapshot
 */
export function computeRecipeCookability(
  ingredients: RecipeIngredient[],
  pantry: PantrySnapshotItem[]
): RecipeCookability {
  const pantrySet = new Set(pantry.map((p) => normalizeLabel(p.name)))

  const missing: string[] = []
  let availableCount = 0

  for (const ing of ingredients) {
    const label = ing.mapping?.inventoryItemLabel || ing.name
    const key = normalizeLabel(label)
    if (!key) continue

    // Pantry staples often won't be tracked; treat "to taste"/no qty as optional in this planning view.
    const optional = Boolean(ing.note && /optional|to taste/i.test(ing.note))
    if (optional) {
      availableCount += 1
      continue
    }

    if (pantrySet.has(key)) availableCount += 1
    else missing.push(label)
  }

  // De-dupe while preserving order
  const seen = new Set<string>()
  const missingLabels = missing.filter((m) => {
    const k = normalizeLabel(m)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return { missingCount: missingLabels.length, missingLabels, availableCount }
}

export type CookabilityBucket = 'cook-now' | 'almost' | 'missing'

export function bucketForMissingCount(missingCount: number): CookabilityBucket {
  if (missingCount === 0) return 'cook-now'
  if (missingCount <= 3) return 'almost'
  return 'missing'
}

export function titleCaseBucket(bucket: CookabilityBucket): string {
  if (bucket === 'cook-now') return 'Cook now'
  if (bucket === 'almost') return 'Almost'
  return 'Missing too much'
}

