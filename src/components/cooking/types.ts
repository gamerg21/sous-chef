export type RecipeId = string

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

export interface PantrySnapshotItem {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit | 'count'
}

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

export interface Recipe {
  id: RecipeId
  title: string
  description?: string
  tags?: string[]
  servings?: number
  totalTimeMinutes?: number
  ingredients: RecipeIngredient[]
}

export type ShoppingListItemSource = 'manual' | 'from-recipe' | 'low-stock'

export interface ShoppingListItem {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit | 'count'
  category?: 'Produce' | 'Dairy' | 'Meat & Seafood' | 'Pantry' | 'Frozen' | 'Bakery' | 'Other'
  checked?: boolean
  note?: string
  source?: ShoppingListItemSource
  recipeId?: RecipeId
}


