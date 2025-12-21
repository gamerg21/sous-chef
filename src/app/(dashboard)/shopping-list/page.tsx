"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingListView,
  type ShoppingListItem,
} from "@/components/cooking";

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchShoppingList = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/shopping-list");
      if (!response.ok) throw new Error("Failed to fetch shopping list");
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error("Error fetching shopping list:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShoppingList();
  }, [fetchShoppingList]);

  const handleToggleItem = useCallback(async (id: string) => {
    try {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      const response = await fetch(`/api/shopping-list/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: !item.checked }),
      });

      if (!response.ok) throw new Error("Failed to update item");
      await fetchShoppingList();
    } catch (error) {
      console.error("Error toggling item:", error);
      alert("Failed to update item. Please try again.");
    }
  }, [items, fetchShoppingList]);

  const handleRemoveItem = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to remove this item?")) return;

    try {
      const response = await fetch(`/api/shopping-list/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete item");
      await fetchShoppingList();
    } catch (error) {
      console.error("Error deleting item:", error);
      alert("Failed to delete item. Please try again.");
    }
  }, [fetchShoppingList]);

  const handleAddItem = useCallback(() => {
    const name = prompt("Enter item name:");
    if (!name || !name.trim()) return;

    const quantityStr = prompt("Enter quantity (optional):");
    const quantity = quantityStr ? parseFloat(quantityStr) : undefined;

    const unit = prompt("Enter unit (optional, e.g., g, kg, count):") || undefined;

    const category = prompt(
      "Enter category (optional: Produce, Dairy, Meat & Seafood, Pantry, Frozen, Bakery, Other):"
    ) as ShoppingListItem["category"] | null;

    handleAddItemWithData({
      name: name.trim(),
      quantity,
      unit,
      category: category || undefined,
      source: "manual",
    });
  }, []);

  const handleAddItemWithData = useCallback(async (itemData: Partial<ShoppingListItem>) => {
    try {
      const response = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemData),
      });

      if (!response.ok) throw new Error("Failed to add item");
      await fetchShoppingList();
    } catch (error) {
      console.error("Error adding item:", error);
      alert("Failed to add item. Please try again.");
    }
  }, [fetchShoppingList]);

  const handleScanBarcode = useCallback(() => {
    alert("Barcode scanning coming soon!");
  }, []);

  const handleClearChecked = useCallback(async () => {
    const checkedItems = items.filter((i) => i.checked);
    if (checkedItems.length === 0) return;

    if (!confirm(`Remove ${checkedItems.length} checked item(s)?`)) return;

    try {
      await Promise.all(
        checkedItems.map((item) =>
          fetch(`/api/shopping-list/${item.id}`, { method: "DELETE" })
        )
      );
      await fetchShoppingList();
    } catch (error) {
      console.error("Error clearing checked items:", error);
      alert("Failed to clear checked items. Please try again.");
    }
  }, [items, fetchShoppingList]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  return (
    <ShoppingListView
      items={items}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onAddItem={handleAddItem}
      onScanBarcode={handleScanBarcode}
      onToggleItem={handleToggleItem}
      onRemoveItem={handleRemoveItem}
      onClearChecked={handleClearChecked}
    />
  );
}
