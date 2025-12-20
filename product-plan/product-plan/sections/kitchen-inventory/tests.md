# Test Instructions: Kitchen Inventory

These test-writing instructions are **framework-agnostic**. Adapt them to your testing setup (Jest, Vitest, Playwright, Cypress, React Testing Library, RSpec, Minitest, PHPUnit, etc.).

## Overview

Kitchen Inventory enables households to track food items across Pantry, Fridge, and Freezer locations with quantities, expiration dates, and photos. Key functionality includes adding items (scan or manual), filtering by location/expiration, and managing inventory.

---

## User Flow Tests

### Flow 1: Add a New Inventory Item

**Scenario:** User wants to add a new item to their inventory

#### Success Path

**Setup:**
- User is logged in and viewing Kitchen Inventory
- Inventory list may be empty or have existing items

**Steps:**
1. User navigates to `/inventory`
2. User sees "Add item" button and "Scan" button
3. User clicks "Add item" button
4. User fills in form: name "Milk", quantity 1, unit "l", location "Fridge", expiration date "2025-12-25"
5. User clicks "Save" button

**Expected Results:**
- [ ] Success toast appears with message "Item added" or similar
- [ ] New item appears in the inventory list
- [ ] Item shows correct location (Fridge tab)
- [ ] Form is cleared and modal/form closes
- [ ] Item count increases

#### Failure Path: Validation Error

**Setup:**
- User is on add item form

**Steps:**
1. User leaves name field empty
2. User clicks "Save" button

**Expected Results:**
- [ ] Name field shows error: "Name is required"
- [ ] Form is not submitted
- [ ] Focus moves to name field

#### Failure Path: Server Error

**Setup:**
- Server returns 500 error when creating item

**Steps:**
1. User fills form correctly
2. User clicks "Save"
3. Server returns error

**Expected Results:**
- [ ] Error message appears: "Unable to save item. Please try again."
- [ ] Form data is preserved, not cleared
- [ ] User can retry

---

### Flow 2: Filter by Expiring Soon

**Scenario:** User wants to see items expiring in the next 3 days

**Setup:**
- Inventory has items with various expiration dates
- Some items expire within 3 days, some later

**Steps:**
1. User navigates to `/inventory`
2. User sees "Expiring soon" filter option or badge showing count
3. User clicks "Expiring soon" filter
4. List updates to show only expiring items

**Expected Results:**
- [ ] List shows only items expiring within 3 days
- [ ] Expired items are also shown
- [ ] Filter is visually active/highlighted
- [ ] Count badge shows correct number

---

### Flow 3: Edit an Existing Item

**Scenario:** User wants to update quantity and expiration date

**Setup:**
- Inventory has an item "Eggs" with quantity 8, expires "2025-12-20"

**Steps:**
1. User clicks on "Eggs" item row or edit button
2. User changes quantity to 6
3. User changes expiration date to "2025-12-22"
4. User clicks "Save"

**Expected Results:**
- [ ] Success message appears
- [ ] Item updates in place with new values
- [ ] Changes persist after page refresh

---

## Empty State Tests

### Primary Empty State

**Scenario:** User has no inventory items yet (first-time user)

**Setup:**
- Inventory list is empty (`[]`)

**Expected Results:**
- [ ] Shows heading "No items yet" or similar
- [ ] Shows helpful description "Add your first item to get started"
- [ ] Shows "Add item" button prominently
- [ ] Clicking "Add item" opens the add form
- [ ] No blank screen or broken layout

### Filtered Empty State

**Scenario:** User applies filter that returns no results

**Setup:**
- Inventory has items, but none match the filter (e.g., no items expiring soon)

**Expected Results:**
- [ ] Shows message "No items match this filter"
- [ ] Shows "Clear filter" or "Show all" link
- [ ] Clicking clear filter shows all items again

---

## Component Interaction Tests

### KitchenInventoryDashboardView

**Renders correctly:**
- [ ] Displays location tabs (Pantry, Fridge, Freezer, All)
- [ ] Shows item count badges
- [ ] Displays search input
- [ ] Shows filter options

**User interactions:**
- [ ] Clicking location tab calls `onSelectLocation` with correct location
- [ ] Typing in search calls `onSearchChange` with query
- [ ] Clicking "Scan" calls `onScanBarcode`
- [ ] Clicking "Add item" calls `onAddItem`

---

## Edge Cases

- [ ] Handles very long item names with text truncation
- [ ] Works correctly with 1 item and 100+ items
- [ ] Preserves data when navigating away and back
- [ ] Transition from empty to populated: After creating first item, list renders correctly
- [ ] Transition from populated to empty: After deleting last item, empty state appears
- [ ] Handles items with no expiration date
- [ ] Handles items with photos and without photos

---

## Sample Test Data

```typescript
// Example test data - populated state
const mockLocation: KitchenLocation = {
  id: 'fridge',
  name: 'Fridge'
};

const mockItem: InventoryItem = {
  id: 'inv_1',
  name: 'Milk',
  locationId: 'fridge',
  quantity: 1,
  unit: 'l',
  expiresOn: '2025-12-25',
  category: 'Dairy'
};

const mockItems = [mockItem];

// Example test data - empty states
const mockEmptyList: InventoryItem[] = [];
```

---

## Notes for Test Implementation

- Mock API calls to test both success and failure scenarios
- Test each callback prop is called with correct arguments
- Verify UI updates optimistically where appropriate
- Test that loading states appear during async operations
- Ensure error boundaries catch and display errors gracefully
- **Always test empty states** — Pass empty arrays to verify helpful empty state UI appears (not blank screens)
- Test transitions: empty → first item created, last item deleted → empty state returns

