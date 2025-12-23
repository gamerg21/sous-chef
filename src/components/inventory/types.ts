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
  expiresOn?: string
  category?: string
  notes?: string
  photoUrl?: string
  barcode?: string
}

export type InventoryFilter = 'all' | 'expiring-soon' | 'low-stock'


