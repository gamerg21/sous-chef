export type KitchenLocationId = 'pantry' | 'fridge' | 'freezer'

export interface KitchenLocation {
  id: KitchenLocationId
  name: string
}

export type QuantityUnit = 'count' | 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l'

export interface InventoryItem {
  id: string
  name: string
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
}

export interface KitchenInventorySampleData {
  locations: KitchenLocation[]
  inventory: InventoryItem[]
}


