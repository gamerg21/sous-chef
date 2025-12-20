# Cooking & Shopping

## Overview

Cooking & Shopping helps a household answer "what can we cook right now?", turn "almost possible" recipes into a focused shopping list, and run a "Cook recipe" flow that deducts inventory and captures missing ingredients.

## User Flows

- Browse "What can I cook?" recommendations based on current inventory
- Filter recipes by cookability (cook now vs almost vs missing too much), time, and tags
- View a recipe's missing ingredients at a glance
- Start "Cook recipe" and confirm what will be deducted from inventory
- Add missing ingredients to a shared shopping list (from a recipe or manually)
- Check off shopping list items while at the store

## Components Provided

- `WhatCanICookView` — Recipe discovery view with cookability filtering
- `RecipeMatchCard` — Recipe card showing cookability status and missing ingredients
- `CookRecipeView` — "Cook recipe" flow showing what will be deducted
- `ShoppingListView` — Shopping list view with quick add and check-off
- `ShoppingListItemRow` — Individual shopping list item row

## Callback Props

| Callback | Description |
|----------|-------------|
| `onCookRecipe` | Called when user clicks "Cook" on a recipe — open cook flow |
| `onAddMissingToShoppingList` | Called when user adds missing ingredients to shopping list |
| `onToggleItemChecked` | Called when user checks/unchecks shopping list item |
| `onAddItem` | Called when user adds item to shopping list |
| `onRemoveItem` | Called when user removes item from shopping list |

