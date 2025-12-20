# Milestone 4: Cooking & Shopping

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 2 (Kitchen Inventory) complete, Milestone 3 (Recipes) complete

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

Implement the Cooking & Shopping feature — "What can I cook?" discovery plus a "Cook recipe" flow that deducts inventory and captures missing ingredients.

## Overview

Cooking & Shopping helps a household answer "what can we cook right now?", turn "almost possible" recipes into a focused shopping list, and run a "Cook recipe" flow that deducts inventory and captures missing ingredients. It's designed to reduce decision fatigue and last‑minute store runs while keeping everything collaborative across the household.

**Key Functionality:**
- Browse "What can I cook?" recommendations based on current inventory
- Filter recipes by cookability (cook now vs almost vs missing too much), time, and tags
- View a recipe's missing ingredients at a glance
- Start "Cook recipe" and confirm what will be deducted from inventory
- Add missing ingredients to a shared shopping list (from a recipe or manually)
- Check off shopping list items while at the store (barcode scan or manual add)
- Handle edge cases: missing ingredient quantities, substitutions, partial inventory, and "pantry staples"

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/cooking-and-shopping/tests.md` for detailed test-writing instructions including:
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

Copy the section components from `product-plan/sections/cooking-and-shopping/components/`:

- `WhatCanICookView` — Recipe discovery view with cookability filtering
- `RecipeMatchCard` — Recipe card showing cookability status and missing ingredients
- `CookRecipeView` — "Cook recipe" flow showing what will be deducted
- `ShoppingListView` — Shopping list view with quick add and check-off
- `ShoppingListItemRow` — Individual shopping list item row

### Data Layer

The components expect these data shapes:

```typescript
interface Recipe {
  id: string
  title: string
  description?: string
  tags?: string[]
  servings?: number
  totalTimeMinutes?: number
  ingredients: RecipeIngredient[]
}

interface PantrySnapshotItem {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit | 'count'
}

interface ShoppingListItem {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit | 'count'
  category?: string
  checked?: boolean
  note?: string
  source?: 'manual' | 'from-recipe' | 'low-stock'
  recipeId?: string
}
```

You'll need to:
- Implement cookability matching logic (compare recipe ingredients to inventory)
- Create API endpoints for "Cook recipe" flow (deduct inventory, add missing to shopping list)
- Handle shopping list CRUD operations
- Connect real data to the components

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onSearchChange` | Called when user types in search input |
| `onSetTag` | Called when user selects a tag filter |
| `onSetCookability` | Called when user changes cookability filter (all/cook-now/almost/missing) |
| `onSetSort` | Called when user changes sort order |
| `onCookRecipe` | Called when user clicks "Cook" on a recipe — open cook flow |
| `onAddMissingToShoppingList` | Called when user adds missing ingredients to shopping list |
| `onOpenShoppingList` | Called when user clicks shopping list link/badge |
| `onToggleItemChecked` | Called when user checks/unchecks shopping list item |
| `onAddItem` | Called when user adds item to shopping list |
| `onRemoveItem` | Called when user removes item from shopping list |

### Empty States

Implement empty state UI for when no records exist yet:

- **No recipes:** Show helpful message when no recipes exist
- **No cookable recipes:** Show message when inventory doesn't match any recipes
- **Empty shopping list:** Show helpful message and CTA when shopping list is empty
- **No search results:** Handle cases where search/filter returns no matches

The provided components include empty state designs — make sure to render them when data is empty rather than showing blank screens.

## Files to Reference

- `product-plan/sections/cooking-and-shopping/README.md` — Feature overview and design intent
- `product-plan/sections/cooking-and-shopping/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/cooking-and-shopping/components/` — React components
- `product-plan/sections/cooking-and-shopping/types.ts` — TypeScript interfaces
- `product-plan/sections/cooking-and-shopping/sample-data.json` — Test data

## Expected User Flows

When fully implemented, users should be able to complete these flows:

### Flow 1: Discover Cookable Recipes

1. User navigates to "What can I cook?" view
2. System shows recipes grouped by cookability (Cook now / Almost / Missing too much)
3. User filters by tag or time
4. User clicks on a recipe to see details
5. **Outcome:** User sees which recipes they can cook and what's missing

### Flow 2: Cook a Recipe

1. User clicks "Cook" button on a recipe
2. System shows what will be deducted from inventory
3. User confirms the deduction
4. System deducts ingredients from inventory
5. System adds missing ingredients to shopping list (if any)
6. **Outcome:** Inventory updated, missing items added to shopping list, success message shown

### Flow 3: Add Missing Ingredients to Shopping List

1. User views a recipe with missing ingredients
2. User clicks "Add missing to list" button
3. System adds missing ingredients to shopping list
4. **Outcome:** Shopping list updated, user can navigate to shopping list

### Flow 4: Manage Shopping List

1. User views shopping list
2. User adds item manually or checks off items while shopping
3. User removes checked items after shopping trip
4. **Outcome:** Shopping list stays in sync, user can track what to buy

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Components render with real data
- [ ] Empty states display properly when no records exist
- [ ] Cookability matching logic works correctly
- [ ] "Cook recipe" flow deducts inventory properly
- [ ] Missing ingredients added to shopping list correctly
- [ ] Shopping list CRUD operations work
- [ ] User can complete all expected flows end-to-end
- [ ] Matches the visual design
- [ ] Responsive on mobile

