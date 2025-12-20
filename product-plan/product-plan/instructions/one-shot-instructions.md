# Sous Chef — Complete Implementation Instructions

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

## Test-Driven Development

Each section includes a `tests.md` file with detailed test-writing instructions. These are **framework-agnostic** — adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, RSpec, Minitest, PHPUnit, etc.).

**For each section:**
1. Read `product-plan/sections/[section-id]/tests.md`
2. Write failing tests for key user flows (success and failure paths)
3. Implement the feature to make tests pass
4. Refactor while keeping tests green

The test instructions include:
- Specific UI elements, button labels, and interactions to verify
- Expected success and failure behaviors
- Empty state handling (when no records exist yet)
- Data assertions and state validations

---

# Milestone 1: Foundation

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** None

## Goal

Set up the foundational elements: design tokens, data model types, routing structure, and application shell.

## What to Implement

### 1. Design Tokens

Configure your styling system with these tokens:

- See `product-plan/design-system/tokens.css` for CSS custom properties
- See `product-plan/design-system/tailwind-colors.md` for Tailwind configuration
- See `product-plan/design-system/fonts.md` for Google Fonts setup

**Colors:**
- Primary: `emerald` — Used for buttons, links, key accents
- Secondary: `amber` — Used for tags, highlights, secondary elements
- Neutral: `stone` — Used for backgrounds, text, borders

**Typography:**
- Heading: `Manrope` — Used for headings and navigation
- Body: `Inter` — Used for body text
- Mono: `JetBrains Mono` — Used for code and technical text

### 2. Data Model Types

Create TypeScript interfaces for your core entities:

- See `product-plan/data-model/types.ts` for interface definitions
- See `product-plan/data-model/README.md` for entity relationships

**Core Entities:**
- Household — Shared kitchen space for one or more people
- User — Person who belongs to a household
- KitchenLocation — Named storage area (Pantry, Fridge, Freezer)
- FoodItem — Canonical ingredient/food concept
- Barcode — Scannable code (UPC/EAN) mapping to FoodItem
- InventoryItem — Stocked item in a household
- MediaAsset — Photo attachment for items and recipes
- Recipe — Recipe stored in the system (private by default)
- RecipeIngredient — Line item in a recipe referencing FoodItem
- ShoppingList — Household's single active shopping list
- ShoppingListItem — Item on the shopping list

### 3. Routing Structure

Create placeholder routes for each section:

- `/inventory` — Kitchen Inventory
- `/recipes` — Recipes
- `/cooking` — Cooking & Shopping
- `/shopping-list` — Shopping List
- `/community` — Community & Extensions
- `/settings` — Settings (optional)

### 4. Application Shell

Copy the shell components from `product-plan/shell/components/` to your project:

- `AppShell.tsx` — Main layout wrapper
- `MainNav.tsx` — Navigation component
- `UserMenu.tsx` — User menu with avatar

**Wire Up Navigation:**

Connect navigation to your routing:

- Kitchen Inventory → `/inventory`
- Recipes → `/recipes`
- Cooking & Shopping → `/cooking`
- Shopping List → `/shopping-list`
- Community → `/community`
- Extensions → `/extensions` (or combine with Community)
- Settings → `/settings`

**User Menu:**

The user menu expects:
- User name
- Avatar URL (optional)
- Logout callback

## Files to Reference

- `product-plan/design-system/` — Design tokens
- `product-plan/data-model/` — Type definitions
- `product-plan/shell/README.md` — Shell design intent
- `product-plan/shell/components/` — Shell React components

## Done When

- [ ] Design tokens are configured
- [ ] Data model types are defined
- [ ] Routes exist for all sections (can be placeholder pages)
- [ ] Shell renders with navigation
- [ ] Navigation links to correct routes
- [ ] User menu shows user info
- [ ] Responsive on mobile

---

# Milestone 2: Kitchen Inventory

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete

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

---

# Milestone 3: Recipes

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 2 (Kitchen Inventory) complete

## Goal

Implement the Recipes feature — private recipe library with ingredient-to-inventory mapping and import/export.

## Overview

Recipes is a private-by-default recipe library for a household. It supports fast capture (manual entry, import), structured ingredients and steps, and lightweight ingredient-to-inventory mapping so other sections can later answer "what can I cook?" and "what am I missing?"

**Key Functionality:**
- Browse and search the recipe library (by title, tag, time)
- View recipe details (ingredients, steps, notes, photos)
- Create a new recipe (title, servings, time, ingredients, steps)
- Edit an existing recipe (including ingredient reordering and step reordering)
- Map ingredients to household inventory items (optional per ingredient)
- Import a recipe (URL or paste text) and review before saving
- Export a recipe (JSON/plain text) for portability
- Favorite/pin recipes for quick access (optional)

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/recipes/tests.md` for detailed test-writing instructions including:
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

Copy the section components from `product-plan/sections/recipes/components/`:

- `RecipeLibraryView` — Main library view with search, filters, and recipe cards
- `RecipeCard` — Individual recipe card display
- `RecipeDetailView` — Full recipe detail view with ingredients and steps
- `RecipeEditorView` — Recipe creation/editing form

### Data Layer

The components expect these data shapes:

```typescript
interface Recipe {
  id: string
  title: string
  description?: string
  photoUrl?: string
  tags?: string[]
  visibility?: 'private' | 'household'
  servings?: number
  totalTimeMinutes?: number
  sourceUrl?: string
  notes?: string
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  updatedAt?: string
  lastCookedAt?: string
  favorited?: boolean
}

interface RecipeIngredient {
  id: string
  name: string
  quantity?: number
  unit?: IngredientUnit
  note?: string
  mapping?: {
    inventoryItemLabel: string
    locationHint?: string
    suggested?: boolean
  }
}
```

You'll need to:
- Create API endpoints for CRUD operations on recipes
- Implement recipe import parsing (URL scraping or text parsing)
- Handle ingredient-to-inventory mapping logic
- Connect real data to the components

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onSearchChange` | Called when user types in search input |
| `onSetTag` | Called when user selects a tag filter |
| `onSetSort` | Called when user changes sort order |
| `onOpenRecipe` | Called when user clicks a recipe card — navigate to detail view |
| `onCreateRecipe` | Called when user clicks "New recipe" — open editor |
| `onImportRecipe` | Called when user clicks "Import" — open import flow |
| `onExportAll` | Called when user clicks "Export all" — download recipes |
| `onEditRecipe` | Called when user clicks edit — open editor with recipe data |
| `onToggleFavorite` | Called when user toggles favorite status |
| `onDeleteRecipe` | Called when user deletes a recipe |

### Empty States

Implement empty state UI for when no records exist yet:

- **No recipes yet:** Show a helpful message and call-to-action when recipe library is empty
- **No search results:** Handle cases where search/filter returns no matches
- **Recipe with no ingredients/steps:** Handle empty ingredient or step lists in editor

The provided components include empty state designs — make sure to render them when data is empty rather than showing blank screens.

## Files to Reference

- `product-plan/sections/recipes/README.md` — Feature overview and design intent
- `product-plan/sections/recipes/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/recipes/components/` — React components
- `product-plan/sections/recipes/types.ts` — TypeScript interfaces
- `product-plan/sections/recipes/sample-data.json` — Test data

## Expected User Flows

When fully implemented, users should be able to complete these flows:

### Flow 1: Create a New Recipe

1. User clicks "New recipe" button
2. User fills in title, description, servings, time, tags
3. User adds ingredients (name, quantity, unit) and maps to inventory items
4. User adds cooking steps
5. User clicks "Save" to create recipe
6. **Outcome:** New recipe appears in library, success message shown

### Flow 2: Import a Recipe

1. User clicks "Import" button
2. User pastes recipe URL or text
3. System parses and shows preview with editable fields
4. User reviews and corrects parsed data
5. User clicks "Save" to import recipe
6. **Outcome:** Recipe imported and appears in library

### Flow 3: View and Edit Recipe

1. User clicks on a recipe card
2. Recipe detail view shows ingredients, steps, metadata
3. User clicks "Edit" button
4. User modifies recipe details, ingredients, or steps
5. User clicks "Save" to update recipe
6. **Outcome:** Recipe updates in place, changes persisted

### Flow 4: Map Ingredient to Inventory

1. User is editing a recipe ingredient
2. System suggests inventory items based on name matching
3. User selects an inventory item from suggestions
4. **Outcome:** Ingredient mapped to inventory item, used for cookability matching

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Components render with real data
- [ ] Empty states display properly when no records exist
- [ ] All user actions work (create, edit, delete, import, export)
- [ ] Recipe import parsing works (can be basic text parsing initially)
- [ ] Ingredient-to-inventory mapping works
- [ ] User can complete all expected flows end-to-end
- [ ] Matches the visual design
- [ ] Responsive on mobile

---

# Milestone 4: Cooking & Shopping

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 2 (Kitchen Inventory) complete, Milestone 3 (Recipes) complete

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

---

# Milestone 5: Shopping List

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 4 (Cooking & Shopping) complete

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

---

# Milestone 6: Community & Extensions

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 3 (Recipes) complete

## Goal

Implement the Community & Extensions feature — optional community recipe discovery and publishing, plus extension marketplace and integrations.

## Overview

Community & Extensions is an optional "power-ups" area for Sous Chef. It lets households discover and install add-ons (integrations and feature extensions), connect third-party services, and optionally publish recipes to a community catalog. It also includes AI configuration using bring-your-own API keys (BYOK) for a self-hosted setup.

**Key Functionality:**
- Browse extension catalog (search, categories, featured, trusted/verified badges)
- View extension details (screenshots/description, permissions/scopes, pricing, reviews)
- Install/uninstall an extension, and enable/disable it per household
- Configure an installed extension (lightweight settings + required permissions)
- Connect/disconnect integrations (e.g., grocery delivery, cloud storage)
- Configure AI provider + API key (BYOK, per provider)
- Add/rotate API keys safely (masked display, "test connection")
- Publish a recipe to the community (public vs unlisted) and manage listing settings
- Browse community recipe feed (trending/recent)
- Save a community recipe into your private library (copy)
- Report a community listing/extension (basic moderation entry point)

## Recommended Approach: Test-Driven Development

Before implementing this section, **write tests first** based on the test specifications provided.

See `product-plan/sections/community-and-extensions/tests.md` for detailed test-writing instructions including:
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

Copy the section components from `product-plan/sections/community-and-extensions/components/`:

- `CommunityHubView` — Main hub with featured recipes and extension marketplace
- `CommunityRecipeFeedView` — Community recipe feed/browse view
- `CommunityRecipeCard` — Individual community recipe card
- `CommunityRecipeDetailView` — Full community recipe detail view
- `ExtensionCard` — Extension marketplace card
- `ExtensionDetailView` — Extension detail view with install/configure
- `IntegrationsSettingsView` — Integrations management view
- `IntegrationRow` — Individual integration row
- `PublishRecipeView` — Recipe publishing flow

### Data Layer

The components expect these data shapes:

```typescript
interface CommunityRecipe {
  id: string
  title: string
  description?: string
  photoUrl?: string
  tags?: string[]
  servings?: number
  totalTimeMinutes?: number
  author: { id: string; name: string; avatarUrl?: string }
  likes?: number
  savedCount?: number
}

interface ExtensionListing {
  id: string
  name: string
  description: string
  category: string
  tags?: string[]
  author: { name: string; verified?: boolean }
  pricing: 'free' | 'paid' | 'trial'
  rating?: number
  installs?: number
  permissions?: string[]
}

interface Integration {
  id: string
  name: string
  description: string
  status: 'connected' | 'disconnected' | 'error'
  scopes?: string[]
  lastSyncAt?: string
}

interface AiSettings {
  keyMode: 'bring-your-own'
  providers: AiProvider[]
  activeProviderId?: string
}
```

You'll need to:
- Create API endpoints for community recipe browsing and publishing
- Implement extension marketplace and installation system
- Handle integration OAuth flows and connection management
- Implement AI provider configuration and API key management
- Connect real data to the components

### Callbacks

Wire up these user actions:

| Callback | Description |
|----------|-------------|
| `onOpenRecipe` | Called when user clicks a community recipe — navigate to detail view |
| `onSaveRecipe` | Called when user saves community recipe to private library |
| `onOpenExtension` | Called when user clicks an extension — navigate to detail view |
| `onInstallExtension` | Called when user installs an extension |
| `onToggleExtensionEnabled` | Called when user enables/disables an extension |
| `onGoToSettings` | Called when user navigates to settings/integrations |
| `onPublishRecipe` | Called when user clicks "Publish recipe" — open publish flow |
| `onConnectIntegration` | Called when user connects an integration |
| `onDisconnectIntegration` | Called when user disconnects an integration |

### Empty States

Implement empty state UI for when no records exist yet:

- **No community recipes:** Show helpful message when feed is empty
- **No extensions:** Show message when marketplace is empty
- **No installed extensions:** Show message in installed extensions list
- **No integrations:** Show message when no integrations are configured

The provided components include empty state designs — make sure to render them when data is empty rather than showing blank screens.

## Files to Reference

- `product-plan/sections/community-and-extensions/README.md` — Feature overview and design intent
- `product-plan/sections/community-and-extensions/tests.md` — Test-writing instructions (use for TDD)
- `product-plan/sections/community-and-extensions/components/` — React components
- `product-plan/sections/community-and-extensions/types.ts` — TypeScript interfaces
- `product-plan/sections/community-and-extensions/sample-data.json` — Test data

## Expected User Flows

When fully implemented, users should be able to complete these flows:

### Flow 1: Browse and Save Community Recipe

1. User navigates to Community feed
2. User browses featured recipes or searches by tag
3. User clicks on a recipe to view details
4. User clicks "Save to Library" button
5. **Outcome:** Recipe copied to user's private library, success message shown

### Flow 2: Install an Extension

1. User navigates to Extensions marketplace
2. User browses extensions by category or searches
3. User clicks on an extension to view details
4. User reviews permissions and clicks "Install"
5. **Outcome:** Extension installed, appears in installed extensions list

### Flow 3: Connect an Integration

1. User navigates to Integrations settings
2. User clicks "Connect" on an integration (e.g., Instacart)
3. User completes OAuth flow
4. **Outcome:** Integration connected, status shows "connected", last sync time displayed

### Flow 4: Publish a Recipe

1. User navigates to Community hub
2. User clicks "Publish a recipe" button
3. User selects a recipe from their library
4. User chooses visibility (public vs unlisted)
5. User reviews and clicks "Publish"
6. **Outcome:** Recipe published to community catalog, appears in feed

### Flow 5: Configure AI Provider

1. User navigates to AI & Integrations settings
2. User selects an AI provider (e.g., Anthropic)
3. User enters API key (masked input)
4. User clicks "Test connection" to verify
5. User sets provider as active
6. **Outcome:** AI provider configured and ready to use

## Done When

- [ ] Tests written for key user flows (success and failure paths)
- [ ] All tests pass
- [ ] Components render with real data
- [ ] Empty states display properly when no records exist
- [ ] Community recipe browsing and saving works
- [ ] Extension marketplace and installation works
- [ ] Integration OAuth flows work
- [ ] AI provider configuration works
- [ ] Recipe publishing works
- [ ] User can complete all expected flows end-to-end
- [ ] Matches the visual design
- [ ] Responsive on mobile

**Note:** This section is optional and can be disabled for strictly private, self-hosted use. Consider making it feature-flag configurable.

