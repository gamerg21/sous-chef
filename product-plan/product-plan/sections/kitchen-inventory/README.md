# Kitchen Inventory

## Overview

Kitchen Inventory helps a household quickly understand what food they have on hand, what's expiring soon, and what needs replenishing. It supports fast entry (scan or manual), lightweight organization (Pantry/Fridge/Freezer), and an at-a-glance "use it first" view to reduce waste.

## User Flows

- View inventory across Pantry, Fridge, and Freezer
- Search and filter inventory (by location, category, expiring soon, low stock)
- Add an item quickly (barcode scan or manual entry)
- Edit an item (quantity, unit, location, expiration date, notes)
- Mark an item as used up / remove it
- See "expiring soon" items and take action (cook, freeze, donate, discard)
- Add a photo to an item (optional)
- Multi-user updates to the shared kitchen (household collaboration)

## Design Decisions

- Location-based organization (Pantry/Fridge/Freezer) for quick mental mapping
- Expiring soon filter with visual emphasis (next 3 days cutoff)
- Fast entry points: primary "Scan" button + secondary "Add item"
- Empty states guide first-time users to add their first items

## Data Used

**Entities:** InventoryItem, KitchenLocation

**From global model:** FoodItem (for barcode mapping), MediaAsset (for photos)

## Visual Reference

See `screenshot.png` for the target UI design (if available).

## Components Provided

- `KitchenInventoryDashboardView` — Main dashboard with location tabs, filters, and item list
- `InventoryItemRow` — Individual inventory item row with actions
- `LocationTabs` — Tab navigation for Pantry/Fridge/Freezer/All

## Callback Props

| Callback | Description |
|----------|-------------|
| `onSelectLocation` | Called when user switches location tab (Pantry/Fridge/Freezer/All) |
| `onChangeFilter` | Called when user changes filter (all/expiring-soon/low-stock) |
| `onSearchChange` | Called when user types in search input |
| `onScanBarcode` | Called when user clicks "Scan" button — open barcode scanner |
| `onAddItem` | Called when user clicks "Add item" button — open add item form/modal |
| `onEditItem` | Called when user clicks edit on an item — open edit form/modal |
| `onRemoveItem` | Called when user removes an item — delete from inventory |
| `onViewExpiringSoon` | Called when user clicks "Expiring soon" filter or badge |

