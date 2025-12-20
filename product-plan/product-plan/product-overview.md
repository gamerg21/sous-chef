# Sous Chef — Product Overview

## Summary

Sous Chef is an open-source, self-hostable personal kitchen assistant for households. It helps you track what you have on hand, discover what you can cook with your inventory, and reduce food waste—without locking you into a closed ecosystem.

## Planned Sections

1. **Kitchen Inventory** — Shared pantry/fridge/freezer tracking with quantities, expirations, photos, and scanning.
2. **Recipes** — Private recipe library with ingredient-to-inventory mapping and import/export.
3. **Cooking & Shopping** — "What can I cook?" discovery plus a "Cook recipe" flow that deducts inventory and captures missing ingredients.
4. **Shopping List** — A shared household shopping list with quick add, barcode scan entry point, and fast check-off while at the store.
5. **Community** — Optional community recipe discovery and publishing (public vs unlisted), with basic reporting/moderation entry points.
6. **Extensions** — Optional extension marketplace + integrations + AI configuration (managed hosted keys vs bring-your-own keys).

## Data Model

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

**Relationships:**
- Household has many User, KitchenLocation, InventoryItem, Recipe
- Household has one ShoppingList
- InventoryItem belongs to Household and KitchenLocation, references FoodItem
- Recipe belongs to Household, has many RecipeIngredient
- RecipeIngredient references FoodItem
- ShoppingList belongs to Household, has many ShoppingListItem
- ShoppingListItem references FoodItem
- MediaAsset can belong to Recipe or InventoryItem

## Design System

**Colors:**
- Primary: emerald — Used for buttons, links, key accents
- Secondary: amber — Used for tags, highlights, secondary elements
- Neutral: stone — Used for backgrounds, text, borders

**Typography:**
- Heading: Manrope — Used for headings and navigation
- Body: Inter — Used for body text
- Mono: JetBrains Mono — Used for code and technical text

## Implementation Sequence

Build this product in milestones:

1. **Foundation** — Set up design tokens, data model types, routing structure, and application shell
2. **Kitchen Inventory** — Shared pantry/fridge/freezer tracking with quantities, expirations, photos, and scanning
3. **Recipes** — Private recipe library with ingredient-to-inventory mapping and import/export
4. **Cooking & Shopping** — "What can I cook?" discovery plus a "Cook recipe" flow that deducts inventory and captures missing ingredients
5. **Shopping List** — A shared household shopping list with quick add, barcode scan entry point, and fast check-off while at the store
6. **Community & Extensions** — Optional community recipe discovery and publishing, plus extension marketplace and integrations

Each milestone has a dedicated instruction document in `product-plan/instructions/`.

