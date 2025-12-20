import type { PantrySnapshotItem, Recipe } from './types'

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function normalizeLabel(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s-]/g, '')
}

export interface RecipeCookability {
  missingCount: number
  missingLabels: string[]
  availableCount: number
}

export function computeRecipeCookability(recipe: Recipe, pantry: PantrySnapshotItem[]): RecipeCookability {
  const pantrySet = new Set(pantry.map((p) => normalizeLabel(p.name)))

  const missing: string[] = []
  let availableCount = 0

  for (const ing of recipe.ingredients) {
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


