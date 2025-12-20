# Shopping List

## Overview

Shopping List is the household's shared "buy next" list. It supports quick capture (manual add or barcode scan entry point), lightweight organization by category, and fast check-off while shopping.

## User Flows

- View the shared shopping list grouped by category
- Search the list (by item name, category, note)
- Add an item manually (quick add)
- Scan an item (barcode scan entry point)
- Toggle an item as purchased (checked)
- Remove an item
- Clear checked items after a trip

## Components Provided

- `ShoppingListView` — Main shopping list view with grouped items
- `ShoppingListItemRow` — Individual shopping list item row

## Callback Props

| Callback | Description |
|----------|-------------|
| `onAddItem` | Called when user clicks "Add item" — open add form/modal |
| `onScanBarcode` | Called when user clicks "Scan" — open barcode scanner |
| `onToggleChecked` | Called when user checks/unchecks an item |
| `onEditItem` | Called when user edits an item |
| `onRemoveItem` | Called when user removes an item |
| `onClearChecked` | Called when user clears all checked items |

