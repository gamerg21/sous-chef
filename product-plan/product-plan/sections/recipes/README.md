# Recipes

## Overview

Recipes is a private-by-default recipe library for a household. It supports fast capture (manual entry, import), structured ingredients and steps, and lightweight ingredient-to-inventory mapping so other sections can later answer "what can I cook?" and "what am I missing?"

## User Flows

- Browse and search the recipe library (by title, tag, time)
- View recipe details (ingredients, steps, notes, photos)
- Create a new recipe (title, servings, time, ingredients, steps)
- Edit an existing recipe (including ingredient reordering and step reordering)
- Map ingredients to household inventory items (optional per ingredient)
- Import a recipe (URL or paste text) and review before saving
- Export a recipe (JSON/plain text) for portability
- Favorite/pin recipes for quick access (optional)

## Design Decisions

- Private-by-default for household privacy
- Ingredient-to-inventory mapping enables cookability matching
- Import flow includes review step for accuracy
- Tag-based filtering for quick discovery

## Data Used

**Entities:** Recipe, RecipeIngredient, RecipeStep

**From global model:** FoodItem (for ingredient mapping), MediaAsset (for photos)

## Components Provided

- `RecipeLibraryView` — Main library view with search, filters, and recipe cards
- `RecipeCard` — Individual recipe card display
- `RecipeDetailView` — Full recipe detail view with ingredients and steps
- `RecipeEditorView` — Recipe creation/editing form

## Callback Props

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

