# Test Instructions: Cooking & Shopping

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Cooking & Shopping enables recipe discovery based on inventory and a "Cook recipe" flow that deducts inventory and adds missing items to the shopping list.

---

## User Flow Tests

### Flow 1: Discover Cookable Recipes

**Setup:** User has inventory items and recipes

**Steps:**
1. User navigates to "What can I cook?" view
2. System shows recipes grouped by cookability
3. User filters by "Cook now"

**Expected Results:**
- [ ] Recipes with all ingredients available are shown
- [ ] Missing ingredient counts are displayed
- [ ] User can click "Cook" on cookable recipes

---

### Flow 2: Cook a Recipe

**Steps:**
1. User clicks "Cook" on a recipe
2. System shows what will be deducted
3. User confirms
4. System deducts ingredients from inventory
5. System adds missing ingredients to shopping list

**Expected Results:**
- [ ] Inventory quantities decrease
- [ ] Missing items appear in shopping list
- [ ] Success message shown

---

## Empty State Tests

**Setup:** No recipes match inventory

**Expected Results:**
- [ ] Shows "No recipes match your inventory" message
- [ ] Suggests adding recipes or inventory items

