# Milestone 5: Shopping List

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 4 (Cooking & Shopping) complete

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

Implement the Shopping List feature — a shared household shopping list with quick add, barcode scan entry point, and fast check-off while at the store.

## Overview

Shopping List is the household's shared "buy next" list. It supports quick capture (manual add or barcode scan entry point), lightweight organization by category, and fast check-off while shopping—keeping everyone aligned and reducing duplicate purchases.

**Key Functionality:**
- View the shared shopping list grouped by category
- Search the list (by item name, category, note)
- Add an item manually (quick add)
- Scan an item (barcode scan entry point; implementation detail)
- Toggle an item as purchased (checked)
- Remove an item
- Clear checked items after a trip
- Handle edge cases: duplicates, missing quantities/units, optional notes, "from recipe" items

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/shopping-list/tests.md` for detailed test-writing instructions including:
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

Copy the section components from `product-plan/sections/shopping-list/components/`:

- `ShoppingListView` — Main shopping list view with grouped items
- `ShoppingListItemRow` — Individual shopping list item row

Note: The shopping list components may be shared with the Cooking & Shopping section. Check both locations.

### Data Layer

The components expect these data shapes:

```typescript
interface ShoppingListItem {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit | 'count'
  category?: 'Produce' | 'Dairy' | 'Meat & Seafood' | 'Pantry' | 'Frozen' | 'Bakery' | 'Other'
  checked?: boolean
  note?: string
  source?: 'manual' | 'from-recipe' | 'low-stock'
  recipeId?: string
}
```

You'll need to:
- Create API endpoints for CRUD operations on shopping list items
- Implement barcode scanning/lookup for adding items
- Handle category grouping and sorting
- Connect real data to the components

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onAddItem` | Called when user clicks "Add item" — open add form/modal |
| `onScanBarcode` | Called when user clicks "Scan" — open barcode scanner |
| `onToggleChecked` | Called when user checks/unchecks an item |
| `onEditItem` | Called when user edits an item — open edit form/modal |
| `onRemoveItem` | Called when user removes an item |
| `onClearChecked` | Called when user clears all checked items after shopping |

### Empty States

Implement empty state UI for when no records exist yet:

- **Empty shopping list:** Show helpful message and CTA when list is empty
- **No search results:** Handle cases where search returns no matches
- **All items checked:** Show message and "Clear checked" option when all items are purchased

The provided components include empty state designs — make sure to render them when data is empty rather than showing blank screens.

## Files to Reference

- `product-plan/sections/shopping-list/README.md` — Feature overview and design intent
- `product-plan/sections/shopping-list/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/shopping-list/components/` — React components
- `product-plan/sections/shopping-list/types.ts` — TypeScript interfaces
- `product-plan/sections/shopping-list/sample-data.json` — Test data

## Expected User Flows

When fully implemented, users should be able to complete these flows:

### Flow 1: Add Item to Shopping List

1. User clicks "Add item" button
2. User enters item name, quantity, unit, category (optional)
3. User clicks "Add" to save item
4. **Outcome:** New item appears in shopping list, grouped by category

### Flow 2: Check Off Items While Shopping

1. User views shopping list on mobile device
2. User checks off items as they shop
3. Items move to "checked" state visually
4. **Outcome:** User can track what's been purchased, list updates in real-time

### Flow 3: Clear Checked Items

1. User finishes shopping trip
2. User clicks "Clear checked" button
3. All checked items are removed from list
4. **Outcome:** List shows only remaining items to buy

### Flow 4: Add Item via Barcode Scan

1. User clicks "Scan" button
2. User scans barcode of item
3. System looks up item and adds to shopping list
4. **Outcome:** Item added automatically from barcode scan

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Components render with real data
- [ ] Empty states display properly when no records exist
- [ ] All user actions work (add, edit, remove, check, clear checked)
- [ ] Barcode scanning entry point is functional (can be placeholder UI)
- [ ] Category grouping works correctly
- [ ] User can complete all expected flows end-to-end
- [ ] Matches the visual design
- [ ] Responsive on mobile

