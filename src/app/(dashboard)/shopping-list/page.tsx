"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
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
import type { ShoppingItemValues } from "@/components/cooking/ShoppingItemForm";

import { StockPurchasesModal } from "@/components/cooking/StockPurchasesModal";

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
  const storageLocations = useQuery(api.shoppingList.storageLocations, {});
  const stockChecked = useMutation(api.shoppingList.stockChecked);
  const [purchaseReview, setPurchaseReview] = useState<ShoppingListItem[] | null>(null);
  const shoppingListData = useQuery(api.shoppingList.get, {});
  const addItem = useMutation(api.shoppingList.addItem);
  const updateItem = useMutation(api.shoppingList.updateItem);
  const deleteItem = useMutation(api.shoppingList.deleteItem);
  const clearChecked = useMutation(api.shoppingList.clearChecked);
  const lookupBarcode = useAction(api.barcodes.lookup);

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

  const handleEditItem = useCallback(
    (id: string) => {
      const item = items.find((candidate) => candidate.id === id);
      if (!item) return;
      setEditingItem(item);
    },
    [items]
  );

  const handleSaveEdit = useCallback(
    async (id: string, values: ShoppingItemValues) => {
      await updateItem({
        id: id as Id<"shoppingListItems">,
        name: values.name,
        quantity: values.quantity ?? null,
        unit: values.unit ?? null,
        category: values.category ?? null,
      });
    }, [updateItem]
  );

  const handleAddItemWithData = useCallback(
    async (values: ShoppingItemValues) => {
      await addItem({ ...values, source: "manual" });
    }, [addItem]
  );

  const handleScanBarcode = useCallback(() => {
    setShowScanner(true);
  }, []);

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      try {
        const lookupData = (await lookupBarcode({
          code: barcode,
        })) as BarcodeLookupResponse;

        if (!lookupData.found) {
          setPrefillItem({ name: barcode });
          setIsAddModalOpen(true);
          setAlertModal({
            isOpen: true,
            message: `Barcode ${barcode} was not found. Add item details manually.`,
            variant: "info",
          });
          return;
        }

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
    [addItem, lookupBarcode]
  );

  const handleClearChecked = useCallback(() => {
    const checkedItems = items.filter((item) => item.checked);
    if (checkedItems.length === 0) return;
    setIsClearCheckedModalOpen(true);
  }, [items]);

  const handleConfirmClearChecked = useCallback(async () => {
    const ids = items.filter(item => item.checked).slice(0, 200).map(item => item.id as Id<"shoppingListItems">);
    if (!ids.length) return;
    try {
      await clearChecked({ ids });
    } catch {
      setAlertModal({ isOpen: true, message: "Couldn’t clear checked items. Please try again.", variant: "error" });
    }
  }, [items, clearChecked]);

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
        onStockChecked={() => setPurchaseReview(items.filter(item => item.checked).slice(0, 100))}
        deletingItems={deletingItems}
      />
      {purchaseReview && storageLocations && <StockPurchasesModal
        items={purchaseReview}
        locations={storageLocations}
        onClose={() => setPurchaseReview(null)}
        onSave={async purchases => {
          const result = await stockChecked({ items: purchases.map(item => ({ ...item, id: item.id as Id<"shoppingListItems">, locationId: item.locationId as Id<"kitchenLocations"> })) });
          setAlertModal({ isOpen: true, message: `${result.stocked} purchase(s) added to inventory.`, variant: "success" });
        }}
      />}
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
        message={`Remove ${Math.min(items.filter((item) => item.checked).length, 200)} checked item(s)?`}
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
