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

export interface ShoppingListSampleData {
  shoppingList: ShoppingListItem[]
}


