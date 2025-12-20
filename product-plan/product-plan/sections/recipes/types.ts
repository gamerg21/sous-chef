export type RecipeId = string

export type RecipeVisibility = 'private' | 'household'

export type IngredientUnit =
  | 'count'
  | 'tsp'
  | 'tbsp'
  | 'cup'
  | 'ml'
  | 'l'
  | 'g'
  | 'kg'
  | 'oz'
  | 'lb'
  | 'pinch'

export interface RecipeIngredientMapping {
  /**
   * Canonical inventory item label (string-only in Design OS planning).
   * In implementation this would likely reference an InventoryItem or Product entity.
   */
  inventoryItemLabel: string
  /** Optional hint for matching, e.g. "fridge", "pantry" */
  locationHint?: string
  /** Whether this mapping was auto-suggested by import / heuristics */
  suggested?: boolean
}

export interface RecipeIngredient {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit
  note?: string
  /** Optional mapping to an inventory concept */
  mapping?: RecipeIngredientMapping
}

export interface RecipeStep {
  id: string
  text: string
}

export interface Recipe {
  id: RecipeId
  title: string
  description?: string
  photoUrl?: string
  tags?: string[]
  visibility?: RecipeVisibility
  servings?: number
  totalTimeMinutes?: number
  sourceUrl?: string
  notes?: string
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  /** ISO date string */
  updatedAt?: string
  /** ISO date string */
  lastCookedAt?: string
  favorited?: boolean
}

export interface PantrySnapshotItem {
  id: string
  name: string
  /** Very lightweight: enough to support “matched vs missing” UI in this section */
  quantity?: number
  unit?: IngredientUnit | 'count'
}

export interface RecipesSampleData {
  recipes: Recipe[]
  /** Optional snapshot used only for design-time ingredient match visuals */
  pantrySnapshot?: PantrySnapshotItem[]
  suggestedTags?: string[]
}


