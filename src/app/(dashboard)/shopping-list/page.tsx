"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShoppingListView,
  type ShoppingListItem,
  EditShoppingListItemModal,
  AddShoppingListItemModal,
} from "@/components/cooking";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { AlertModal } from "@/components/ui/alert-modal";

export default function ShoppingListPage() {
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isClearCheckedModalOpen, setIsClearCheckedModalOpen] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });

  const fetchShoppingList = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/shopping-list", {
        credentials: "include",
      });
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
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const newChecked = !item.checked;

    // Optimistic update
    setItems((prevItems) =>
      prevItems.map((i) =>
        i.id === id ? { ...i, checked: newChecked } : i
      )
    );

    try {
      const response = await fetch(`/api/shopping-list/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ checked: newChecked }),
      });

      if (!response.ok) throw new Error("Failed to update item");
      
      // Update from response to ensure consistency
      const updated = await response.json();
      setItems((prevItems) =>
        prevItems.map((i) =>
          i.id === id ? { ...i, checked: updated.checked } : i
        )
      );
    } catch (error) {
      console.error("Error toggling item:", error);
      // Revert optimistic update on error
      setItems((prevItems) =>
        prevItems.map((i) =>
          i.id === id ? { ...i, checked: item.checked } : i
        )
      );
      setAlertModal({ isOpen: true, message: "Failed to update item. Please try again.", variant: 'error' });
    }
  }, [items]);

  const handleRemoveItem = useCallback(async (id: string) => {
    // Start deletion animation
    setDeletingItems((prev) => new Set(prev).add(id));

    // Wait for animation to complete before removing from DOM
    setTimeout(async () => {
      try {
        const response = await fetch(`/api/shopping-list/${id}`, {
          method: "DELETE",
          credentials: "include",
        });

        if (!response.ok) throw new Error("Failed to delete item");
        
        // Remove from state after successful deletion
        setItems((prevItems) => prevItems.filter((i) => i.id !== id));
        setDeletingItems((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (error) {
        console.error("Error deleting item:", error);
        // Revert animation on error
        setDeletingItems((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setAlertModal({ isOpen: true, message: "Failed to delete item. Please try again.", variant: 'error' });
      }
    }, 300); // Match animation duration
  }, []);

  const handleAddItem = useCallback(() => {
    setIsAddModalOpen(true);
  }, []);

  const handleUpdateItemWithData = useCallback(
    async (id: string, itemData: Partial<ShoppingListItem>) => {
      try {
        const response = await fetch(`/api/shopping-list/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(itemData),
        });

        if (!response.ok) throw new Error("Failed to update item");
        
        // Update from response
        const updated = await response.json();
        setItems((prevItems) =>
          prevItems.map((i) =>
            i.id === id ? { ...i, ...updated } : i
          )
        );
      } catch (error) {
        console.error("Error updating item:", error);
        setAlertModal({ isOpen: true, message: "Failed to update item. Please try again.", variant: 'error' });
      }
    },
    []
  );

  const handleEditItem = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;
      setEditingItem(item);
    },
    [items]
  );

  const handleSaveEdit = useCallback(
    async (id: string, updates: { name: string; category?: ShoppingListItem["category"] }) => {
      await handleUpdateItemWithData(id, updates);
      setEditingItem(null);
    },
    [handleUpdateItemWithData]
  );

  const handleAddItemWithData = useCallback(async (itemData: { name: string; quantity?: number; unit?: string; category?: ShoppingListItem["category"] }) => {
    try {
      const response = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...itemData,
          source: "manual",
        }),
      });

      if (!response.ok) throw new Error("Failed to add item");
      
      // Add new item from response
      const newItem = await response.json();
      setItems((prevItems) => [...prevItems, newItem]);
    } catch (error) {
      console.error("Error adding item:", error);
      setAlertModal({ isOpen: true, message: "Failed to add item. Please try again.", variant: 'error' });
    }
  }, []);

  const handleScanBarcode = useCallback(() => {
    setAlertModal({ isOpen: true, message: "Barcode scanning coming soon!", variant: 'info' });
  }, []);

  const handleClearChecked = useCallback(() => {
    const checkedItems = items.filter((i) => i.checked);
    if (checkedItems.length === 0) return;
    setIsClearCheckedModalOpen(true);
  }, [items]);

  const handleConfirmClearChecked = useCallback(async () => {
    const checkedItems = items.filter((i) => i.checked);
    if (checkedItems.length === 0) return;

    // Start deletion animations for all checked items
    const checkedIds = new Set(checkedItems.map((item) => item.id));
    setDeletingItems((prev) => new Set([...prev, ...checkedIds]));

    // Wait for animation to complete before removing from DOM
    setTimeout(async () => {
      try {
        await Promise.all(
          checkedItems.map((item) =>
            fetch(`/api/shopping-list/${item.id}`, {
              method: "DELETE",
              credentials: "include",
            })
          )
        );
        
        // Remove from state after successful deletion
        setItems((prevItems) => prevItems.filter((i) => !checkedIds.has(i.id)));
        setDeletingItems((prev) => {
          const next = new Set(prev);
          checkedIds.forEach((id) => next.delete(id));
          return next;
        });
      } catch (error) {
        console.error("Error clearing checked items:", error);
        // Revert animation on error
        setDeletingItems((prev) => {
          const next = new Set(prev);
          checkedIds.forEach((id) => next.delete(id));
          return next;
        });
        setAlertModal({ isOpen: true, message: "Failed to clear checked items. Please try again.", variant: 'error' });
      }
    }, 300); // Match animation duration
  }, [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <ShoppingListView
        items={items}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddItem={handleAddItem}
        onScanBarcode={handleScanBarcode}
        onToggleItem={handleToggleItem}
        onEditItem={handleEditItem}
        onRemoveItem={handleRemoveItem}
        onClearChecked={handleClearChecked}
        deletingItems={deletingItems}
      />
      <EditShoppingListItemModal
        isOpen={editingItem !== null}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveEdit}
      />
      <AddShoppingListItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddItemWithData}
      />
      <ConfirmModal
        isOpen={isClearCheckedModalOpen}
        onClose={() => setIsClearCheckedModalOpen(false)}
        onConfirm={handleConfirmClearChecked}
        title="Clear checked items"
        message={`Remove ${items.filter((i) => i.checked).length} checked item(s)?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </>
  );
}
