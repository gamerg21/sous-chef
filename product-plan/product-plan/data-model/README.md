# Data Model

## Entities

### Household
A shared kitchen space for one or more people; the container for inventory, recipes, and a single shopping list.

### User
A person who belongs to a household and collaborates on the shared kitchen (inventory, recipes, and shopping list).

### KitchenLocation
A named storage area within a household (e.g., Pantry, Fridge, Freezer) used to organize where inventory is stored.

### FoodItem
A canonical ingredient/food concept used for consistency across inventory and recipes (e.g., "Egg", "Jasmine rice").

### Barcode
A scannable code (UPC/EAN) that maps to a FoodItem to support barcode-based entry and lookup.

### InventoryItem
A stocked item in a household that references a FoodItem, is stored in a KitchenLocation, and tracks quantity/unit and (when applicable) a single expiration date.

### MediaAsset
A photo attachment that can be linked to inventory items and recipes.

### Recipe
A recipe stored in the system (private by default) owned within a household and optionally publishable later.

### RecipeIngredient
A line item in a recipe that references a FoodItem and includes quantity/unit to enable matching against inventory.

### ShoppingList
The household's single active shopping list.

### ShoppingListItem
An item on the shopping list (often referencing a FoodItem) with quantity/unit; optionally linked to a recipe or a "missing from cook" event.

## Relationships

- Household has many User
- Household has many KitchenLocation
- Household has many InventoryItem
- InventoryItem belongs to Household
- InventoryItem belongs to KitchenLocation
- InventoryItem references FoodItem
- Barcode references FoodItem
- Household has many Recipe
- Recipe belongs to Household
- Recipe has many RecipeIngredient
- RecipeIngredient references FoodItem
- Household has one ShoppingList
- ShoppingList belongs to Household
- ShoppingList has many ShoppingListItem
- ShoppingListItem references FoodItem
- MediaAsset can belong to a Recipe or an InventoryItem

