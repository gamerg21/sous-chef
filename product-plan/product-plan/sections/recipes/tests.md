# Test Instructions: Recipes

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Recipes enables households to manage a private recipe library with ingredients, steps, and inventory mapping. Key functionality includes creating/editing recipes, importing from URLs/text, and mapping ingredients to inventory items.

---

## User Flow Tests

### Flow 1: Create a New Recipe

**Scenario:** User wants to add a new recipe to their library

#### Success Path

**Steps:**
1. User navigates to `/recipes`
2. User clicks "New recipe" button
3. User fills in title "Pasta Carbonara", servings 4, time 30 minutes
4. User adds ingredients: "Spaghetti", "Eggs", "Parmesan"
5. User adds steps: "Boil pasta", "Mix eggs and cheese", "Combine"
6. User clicks "Save"

**Expected Results:**
- [ ] Success message appears
- [ ] New recipe appears in library
- [ ] Recipe card shows title, time, servings
- [ ] Form is cleared

#### Failure Path: Validation

**Steps:**
1. User leaves title empty
2. User clicks "Save"

**Expected Results:**
- [ ] Title field shows error "Title is required"
- [ ] Form is not submitted

---

### Flow 2: Import a Recipe

**Scenario:** User wants to import a recipe from a URL

**Steps:**
1. User clicks "Import" button
2. User pastes recipe URL
3. System parses recipe and shows preview
4. User reviews parsed data
5. User clicks "Save"

**Expected Results:**
- [ ] Parsed ingredients and steps are shown
- [ ] User can edit parsed data before saving
- [ ] Recipe is saved to library after confirmation

---

## Empty State Tests

### Primary Empty State

**Setup:** Recipe library is empty (`[]`)

**Expected Results:**
- [ ] Shows "No recipes yet" message
- [ ] Shows "Create recipe" CTA button
- [ ] Clicking button opens recipe editor

---

## Sample Test Data

```typescript
const mockRecipe: Recipe = {
  id: 'rcp_1',
  title: 'Pasta Carbonara',
  servings: 4,
  totalTimeMinutes: 30,
  ingredients: [
    { id: 'ing_1', name: 'Spaghetti', quantity: 500, unit: 'g' }
  ],
  steps: [
    { id: 'st_1', text: 'Boil pasta' }
  ]
};
```

