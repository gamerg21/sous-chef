export type RecipeId = string

export type RecipeVisibility = 'private' | 'household'

export type IngredientUnit = string

export interface RecipeIngredientMapping {
  inventoryItemLabel: string
  locationHint?: string
  suggested?: boolean
}

export interface RecipeIngredient {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit
  note?: string
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
  caloriesKcal?: number
  proteinGrams?: number
  carbsGrams?: number
  fatGrams?: number
  sourceUrl?: string
  notes?: string
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  updatedAt?: string
  lastCookedAt?: string
  favorited?: boolean
}

export interface PantrySnapshotItem {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit | 'count'
}

export interface RecipesSampleData {
  recipes: Recipe[]
  pantrySnapshot?: PantrySnapshotItem[]
  suggestedTags?: string[]
}
