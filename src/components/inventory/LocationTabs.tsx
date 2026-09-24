import { LayoutGrid, Package, Refrigerator, Snowflake } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/kit'
import type { KitchenLocation, KitchenLocationId } from './types'

export interface LocationTabsProps {
  locations: KitchenLocation[]
  value: KitchenLocationId | 'all'
  onChange?: (value: KitchenLocationId | 'all') => void
}

/** Icon for a storage location, shared by the tabs and inventory rows. */
export function locationIcon(id: KitchenLocationId | 'all') {
  return id === 'fridge' ? Refrigerator : id === 'freezer' ? Snowflake : id === 'pantry' ? Package : LayoutGrid
}

export function LocationTabs({ locations, value, onChange }: LocationTabsProps) {
  const options: Array<{ value: KitchenLocationId | 'all'; label: string; icon: ReturnType<typeof locationIcon> }> = [
    { value: 'all', label: 'All', icon: locationIcon('all') },
    ...locations.map((location) => ({ value: location.id, label: location.name, icon: locationIcon(location.id) })),
  ]

  return (
    <SegmentedControl
      label="Filter by location"
      options={options}
      value={value}
      onChange={(next) => onChange?.(next)}
      className="max-w-full overflow-x-auto"
    />
  )
}
