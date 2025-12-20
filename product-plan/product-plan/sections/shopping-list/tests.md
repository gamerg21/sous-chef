# Test Instructions: Shopping List

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup.

## Overview

Shopping List enables households to manage a shared shopping list with category grouping and check-off functionality.

---

## User Flow Tests

### Flow 1: Add Item to Shopping List

**Steps:**
1. User clicks "Add item"
2. User enters name "Milk", category "Dairy"
3. User clicks "Add"

**Expected Results:**
- [ ] Item appears in shopping list
- [ ] Item is grouped by category
- [ ] Success message shown

---

### Flow 2: Check Off Items

**Steps:**
1. User checks off item while shopping
2. Item moves to checked state

**Expected Results:**
- [ ] Item shows as checked visually
- [ ] Checked items can be cleared after trip

---

## Empty State Tests

**Setup:** Shopping list is empty (`[]`)

**Expected Results:**
- [ ] Shows "No items yet" message
- [ ] Shows "Add item" CTA button

