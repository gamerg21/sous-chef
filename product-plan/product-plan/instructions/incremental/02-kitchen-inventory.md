# Milestone 2: Kitchen Inventory

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete

---

## About These Instructions

**What you're receiving:**
- Finished UI designs (React components with full styling)
- Data model definitions (TypeScript types and sample data)
- UI/UX specifications (user flows, requirements, screenshots)
- Design system tokens (colors, typography, spacing)
- Test-writing instructions for each section (for TDD approach)

**What you need to build:**
- Backend API endpoints and database schema
- Authentication and authorization
- Data fetching and state management
- Business logic and validation
- Integration of the provided UI components with real data

**Important guidelines:**
- **DO NOT** redesign or restyle the provided components — use them as-is
- **DO** wire up the callback props to your routing and API calls
- **DO** replace sample data with real data from your backend
- **DO** implement proper error handling and loading states
- **DO** implement empty states when no records exist (first-time users, after deletions)
- **DO** use test-driven development — write tests first using `tests.md` instructions
- The components are props-based and ready to integrate — focus on the backend and data layer

---

## Goal

Implement the Kitchen Inventory feature — shared pantry/fridge/freezer tracking with quantities, expirations, photos, and scanning.

## Overview

Kitchen Inventory helps a household quickly understand what food they have on hand, what's expiring soon, and what needs replenishing. It supports fast entry (scan or manual), lightweight organization (Pantry/Fridge/Freezer), and an at-a-glance "use it first" view to reduce waste.

**Key Functionality:**
- View inventory across Pantry, Fridge, and Freezer locations
- Search and filter inventory (by location, category, expiring soon, low stock)
- Add an item quickly (barcode scan or manual entry)
- Edit an item (quantity, unit, location, expiration date, notes)
- Mark an item as used up / remove it
- See "expiring soon" items and take action (cook, freeze, donate, discard)
- Add a photo to an item (optional)
- Multi-user updates to the shared kitchen (household collaboration)

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/kitchen-inventory/tests.md` for detailed test-writing instructions including:
- Key user flows to test (success and failure paths)
- Specific UI elements, button labels, and interactions to verify
- Expected behaviors and assertions

The test instructions are framework-agnostic — adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, RSpec, Minitest, PHPUnit, etc.).

**TDD Workflow:**
1. Read `tests.md` and write failing tests for the key user flows
2. Implement the feature to make tests pass
3. Refactor while keeping tests green

## What to Implement

### Components

Copy the section components from `product-plan/sections/kitchen-inventory/components/`:

- `KitchenInventoryDashboardView` — Main dashboard with location tabs, filters, and item list
- `InventoryItemRow` — Individual inventory item row with actions
- `LocationTabs` — Tab navigation for Pantry/Fridge/Freezer/All

### Data Layer

The components expect these data shapes:

```typescript
interface KitchenLocation {
  id: 'pantry' | 'fridge' | 'freezer'
  name: string
}

interface InventoryItem {
  id: string
  name: string
  locationId: KitchenLocationId
  quantity: number
  unit: QuantityUnit
  expiresOn?: string // ISO date (YYYY-MM-DD)
  category?: string
  notes?: string
  photoUrl?: string
  barcode?: string
}
```

You'll need to:
- Create API endpoints for CRUD operations on inventory items
- Implement barcode scanning/lookup (UPC/EAN to FoodItem mapping)
- Handle photo uploads and storage
- Connect real data to the components

### Callbacks

Wire up these user actions:

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

### Empty States

Implement empty state UI for when no records exist yet:

- **No inventory yet:** Show a helpful message and call-to-action when inventory is empty
- **No search results:** Handle cases where search/filter returns no matches
- **No expiring soon items:** Show appropriate message when filter is active but no items match

The provided components include empty state designs — make sure to render them when data is empty rather than showing blank screens.

## Files to Reference

- `product-plan/sections/kitchen-inventory/README.md` — Feature overview and design intent
- `product-plan/sections/kitchen-inventory/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/kitchen-inventory/components/` — React components
- `product-plan/sections/kitchen-inventory/types.ts` — TypeScript interfaces
- `product-plan/sections/kitchen-inventory/sample-data.json` — Test data

## Expected User Flows

When fully implemented, users should be able to complete these flows:

### Flow 1: Add a New Inventory Item

1. User clicks "Add item" button
2. User fills in item name, quantity, unit, location, expiration date (optional)
3. User optionally scans barcode or adds photo
4. User clicks "Save" to add item
5. **Outcome:** New item appears in the inventory list, success message shown

### Flow 2: Edit an Existing Item

1. User clicks on an inventory item row or edit button
2. User modifies quantity, location, expiration date, or notes
3. User clicks "Save" to confirm changes
4. **Outcome:** Item updates in place, changes persisted

### Flow 3: Filter by Expiring Soon

1. User clicks "Expiring soon" filter or badge
2. List filters to show only items expiring in next 3 days
3. User can take action on items (cook, freeze, discard)
4. **Outcome:** Filtered list shows relevant items, user can act on them

### Flow 4: Remove an Item

1. User clicks remove/delete icon on an item
2. User confirms deletion
3. **Outcome:** Item removed from list, empty state shown if last item

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Components render with real data
- [ ] Empty states display properly when no records exist
- [ ] All user actions work (add, edit, remove, filter, search)
- [ ] Barcode scanning entry point is functional (can be placeholder UI)
- [ ] Photo upload works (if implemented)
- [ ] User can complete all expected flows end-to-end
- [ ] Matches the visual design
- [ ] Responsive on mobile

