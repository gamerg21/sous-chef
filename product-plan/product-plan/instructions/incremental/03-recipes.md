# Milestone 3: Recipes

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** Milestone 1 (Foundation) complete, Milestone 2 (Kitchen Inventory) complete

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

