/**
 * Core Data Model Types for Sous Chef
 * 
 * This file consolidates the core entity types used across all sections.
 * Section-specific types are also provided in each section's types.ts file.
 */

// ============================================================================
// Core Entities
// ============================================================================

export type HouseholdId = string
export type UserId = string
export type FoodItemId = string
export type BarcodeId = string
export type MediaAssetId = string
export type RecipeId = string
export type ShoppingListId = string

export interface Household {
  id: HouseholdId
  name: string
  createdAt: string
  updatedAt: string
}

export interface User {
  id: UserId
  name: string
  email: string
  avatarUrl?: string
  createdAt: string
}

export type KitchenLocationId = 'pantry' | 'fridge' | 'freezer'

export interface KitchenLocation {
  id: KitchenLocationId
  householdId: HouseholdId
  name: string
}

export interface FoodItem {
  id: FoodItemId
  name: string
  /** Optional canonical name for matching */
  canonicalName?: string
}

export interface Barcode {
  id: BarcodeId
  foodItemId: FoodItemId
  code: string // UPC/EAN
  type: 'UPC' | 'EAN'
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
  householdId: HouseholdId
  foodItemId: FoodItemId
  locationId: KitchenLocationId
  quantity: number
  unit: QuantityUnit
  /** ISO date (YYYY-MM-DD) when applicable */
  expiresOn?: string
  /** Optional group/category for filtering (e.g., Produce, Dairy) */
  category?: string
  /** Optional notes for household context */
  notes?: string
  /** Optional photo URL (in a real app this would be a media reference) */
  photoUrl?: string
  /** Optional barcode (UPC/EAN) */
  barcode?: string
  /** Optional enriched facts from barcode providers */
  foodFacts?: FoodFacts
}

export interface MediaAsset {
  id: MediaAssetId
  url: string
  /** Optional reference to recipe or inventory item */
  recipeId?: RecipeId
  inventoryItemId?: string
  uploadedAt: string
}

export type RecipeVisibility = 'private' | 'household' | 'public' | 'unlisted'

export type IngredientUnit = string

export interface RecipeIngredient {
  id: string
  recipeId: RecipeId
  foodItemId?: FoodItemId
  name: string
  quantity?: number
  unit?: IngredientUnit
  note?: string
}

export interface RecipeStep {
  id: string
  recipeId: RecipeId
  text: string
  order: number
}

export interface Recipe {
  id: RecipeId
  householdId: HouseholdId
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
  /** ISO date string */
  createdAt: string
  /** ISO date string */
  updatedAt?: string
  /** ISO date string */
  lastCookedAt?: string
  favorited?: boolean
}

export interface ShoppingList {
  id: ShoppingListId
  householdId: HouseholdId
  createdAt: string
  updatedAt: string
}

export type ShoppingListItemSource = 'manual' | 'from-recipe' | 'low-stock'

export interface ShoppingListItem {
  id: string
  shoppingListId: ShoppingListId
  foodItemId?: FoodItemId
  name: string
  quantity?: number
  unit?: IngredientUnit | 'count'
  category?: 'Produce' | 'Dairy' | 'Meat & Seafood' | 'Pantry' | 'Frozen' | 'Bakery' | 'Other'
  checked?: boolean
  note?: string
  source?: ShoppingListItemSource
  recipeId?: RecipeId
}

export interface UserPreferences {
  id: string
  userId: UserId
  measurementSystem: 'metric' | 'imperial'
  defaultWeightUnit: 'g' | 'kg' | 'oz' | 'lb'
  defaultVolumeUnit: 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp'
  timezone?: string
  dateFormat?: string
}
