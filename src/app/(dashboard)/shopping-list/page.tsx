"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  ShoppingListView,
  type ShoppingListItem,
  EditShoppingListItemModal,
  AddShoppingListItemModal,
} from "@/components/cooking";
import { BarcodeScanner } from "@/components/inventory/BarcodeScanner";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { AlertModal } from "@/components/ui/alert-modal";
interface BarcodeLookupResponse {
  found: boolean;
  prefill: {
    name?: string;
    category?: ShoppingListItem["category"];
  };
  facts?: Record<string, unknown>;
}

const SHOPPING_CATEGORIES = [
  "Produce",
  "Dairy",
  "Meat & Seafood",
  "Pantry",
  "Frozen",
  "Bakery",
  "Other",
] as const;

function toShoppingCategory(
  value: string | undefined
): ShoppingListItem["category"] | undefined {
  if (!value) return undefined;
  return SHOPPING_CATEGORIES.includes(value as (typeof SHOPPING_CATEGORIES)[number])
    ? (value as ShoppingListItem["category"])
    : undefined;
}

function toShoppingSource(
  value: string | undefined
): ShoppingListItem["source"] | undefined {
  if (value === "manual" || value === "from-recipe" || value === "low-stock") {
    return value;
  }
  return undefined;
}

export default function ShoppingListPage() {
  const shoppingListData = useQuery(api.shoppingList.get, {});
  const addItem = useMutation(api.shoppingList.addItem);
  const updateItem = useMutation(api.shoppingList.updateItem);
  const deleteItem = useMutation(api.shoppingList.deleteItem);

  const items = useMemo<ShoppingListItem[]>(
    () =>
      (shoppingListData?.items || []).map((item) => ({
        ...item,
        id: String(item.id),
        category: toShoppingCategory(item.category),
        source: toShoppingSource(item.source),
      })),
    [shoppingListData?.items]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [prefillItem, setPrefillItem] = useState<{
    name?: string;
    quantity?: number;
    unit?: string;
    category?: ShoppingListItem["category"];
  } | null>(null);
  const [isClearCheckedModalOpen, setIsClearCheckedModalOpen] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handleToggleItem = useCallback(
    async (id: string) => {
      const existing = items.find((item) => item.id === id);
      if (!existing) return;

      const nextChecked = !Boolean(existing.checked);

      try {
        await updateItem({ id: id as Id<"shoppingListItems">, checked: nextChecked });
      } catch (error) {
        console.error("Error toggling item:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to update item. Please try again.",
          variant: "error",
        });
      }
    },
    [items, updateItem]
  );

  const handleRemoveItem = useCallback(
    async (id: string) => {
      setDeletingItems((previous) => new Set(previous).add(id));

      setTimeout(async () => {
        try {
          await deleteItem({ id: id as Id<"shoppingListItems"> });
          setDeletingItems((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
        } catch (error) {
          console.error("Error deleting item:", error);
          setDeletingItems((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
          setAlertModal({
            isOpen: true,
            message: "Failed to delete item. Please try again.",
            variant: "error",
          });
        }
      }, 300);
    },
    [deleteItem]
  );

  const handleAddItem = useCallback(() => {
    setPrefillItem(null);
    setIsAddModalOpen(true);
  }, []);

  const handleUpdateItemWithData = useCallback(
    async (id: string, itemData: Partial<ShoppingListItem>) => {
      try {
        await updateItem({
          id: id as Id<"shoppingListItems">,
          name: itemData.name,
          quantity: itemData.quantity,
          unit: itemData.unit,
          category: itemData.category,
          checked: itemData.checked,
          note: itemData.note,
        });
      } catch (error) {
        console.error("Error updating item:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to update item. Please try again.",
          variant: "error",
        });
      }
    },
    [updateItem]
  );

  const handleEditItem = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
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

  const handleAddItemWithData = useCallback(
    async (itemData: {
      name: string;
      quantity?: number;
      unit?: string;
      category?: ShoppingListItem["category"];
    }) => {
      try {
        await addItem({
          ...itemData,
          source: "manual",
        });
      } catch (error) {
        console.error("Error adding item:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to add item. Please try again.",
          variant: "error",
        });
      }
    },
    [addItem]
  );

  const handleScanBarcode = useCallback(() => {
    setShowScanner(true);
  }, []);

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      try {
        const lookupResponse = await fetch(
          `/api/barcode/lookup?code=${encodeURIComponent(barcode)}`
        );

        if (lookupResponse.status === 404) {
          setPrefillItem({ name: barcode });
          setIsAddModalOpen(true);
          setAlertModal({
            isOpen: true,
            message: `Barcode ${barcode} was not found. Add item details manually.`,
            variant: "info",
          });
          return;
        }

        if (!lookupResponse.ok) {
          throw new Error("Failed to lookup barcode");
        }

        const lookupData = (await lookupResponse.json()) as BarcodeLookupResponse;
        if (!lookupData.prefill.name) {
          throw new Error("Scanned barcode result did not include a product name.");
        }
        await addItem({
          name: lookupData.prefill.name,
          category: lookupData.prefill.category,
          source: "manual",
        });

        setAlertModal({
          isOpen: true,
          message: `Added ${lookupData.prefill.name} from barcode scan.`,
          variant: "success",
        });
      } catch (error) {
        console.error("Error handling shopping barcode scan:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to process barcode scan. Please try again.",
          variant: "error",
        });
      }
    },
    [addItem]
  );

  const handleClearChecked = useCallback(() => {
    const checkedItems = items.filter((item) => item.checked);
    if (checkedItems.length === 0) return;
    setIsClearCheckedModalOpen(true);
  }, [items]);

  const handleConfirmClearChecked = useCallback(async () => {
    const checkedItems = items.filter((item) => item.checked);
    if (checkedItems.length === 0) return;

    const checkedIds = new Set(checkedItems.map((item) => item.id));
    setDeletingItems((previous) => new Set([...previous, ...checkedIds]));

    setTimeout(async () => {
      try {
        await Promise.all(
          checkedItems.map((item) => deleteItem({ id: item.id as Id<"shoppingListItems"> }))
        );

        setDeletingItems((previous) => {
          const next = new Set(previous);
          checkedIds.forEach((id) => next.delete(id));
          return next;
        });
      } catch (error) {
        console.error("Error clearing checked items:", error);
        setDeletingItems((previous) => {
          const next = new Set(previous);
          checkedIds.forEach((id) => next.delete(id));
          return next;
        });
        setAlertModal({
          isOpen: true,
          message: "Failed to clear checked items. Please try again.",
          variant: "error",
        });
      }
    }, 300);
  }, [items, deleteItem]);

  if (shoppingListData === undefined) {
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
        onClose={() => {
          setIsAddModalOpen(false);
          setPrefillItem(null);
        }}
        onSave={handleAddItemWithData}
        prefill={prefillItem}
      />
      {showScanner && (
        <BarcodeScanner
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleBarcodeScanned}
        />
      )}
      <ConfirmModal
        isOpen={isClearCheckedModalOpen}
        onClose={() => setIsClearCheckedModalOpen(false)}
        onConfirm={handleConfirmClearChecked}
        title="Clear checked items"
        message={`Remove ${items.filter((item) => item.checked).length} checked item(s)?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </>
  );
}
