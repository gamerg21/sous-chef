# Milestone 1: Foundation

> **Provide alongside:** `product-overview.md`
> **Prerequisites:** None

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

