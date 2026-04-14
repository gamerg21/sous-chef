export type KitchenLocationId = 'pantry' | 'fridge' | 'freezer'

export const INVENTORY_CATEGORY_OPTIONS = [
  'Produce',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen',
  'Bakery',
  'Beverages',
  'Canned Goods',
  'Grains & Rice',
  'Pasta & Noodles',
  'Spices & Seasonings',
  'Condiments & Sauces',
  'Snacks',
  'Other',
] as const

export const INVENTORY_CUSTOM_CATEGORY_VALUE = '__custom__'
export const INVENTORY_ALL_CATEGORIES_VALUE = 'all'
export const INVENTORY_UNCATEGORIZED_LABEL = 'Uncategorized'

export interface KitchenLocation {
  id: KitchenLocationId
  name: string
}

export type QuantityUnit = string

export interface NutritionPer100g {
  energyKcal?: number
  fatG?: number
  carbsG?: number
  sugarsG?: number
  proteinG?: number
  saltG?: number
  fiberG?: number
}

export interface FoodFacts {
  brand?: string
  categoriesTags?: string[]
  ingredientsText?: string
  allergensTags?: string[]
  nutriscoreGrade?: string
  novaGroup?: number
  ecoscoreGrade?: string
  imageFrontUrl?: string
  nutritionPer100g?: NutritionPer100g
}

export interface InventoryItem {
  id: string
  name: string
  locationId: KitchenLocationId
  quantity: number
  unit: QuantityUnit
  expiresOn?: string
  category?: string
  notes?: string
  photoUrl?: string
  barcode?: string
  foodFacts?: FoodFacts
}

export type InventoryFilter = 'all' | 'expiring-soon' | 'low-stock'
