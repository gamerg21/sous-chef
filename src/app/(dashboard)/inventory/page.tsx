"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { KitchenInventoryDashboardView } from "@/components/inventory";
import { BarcodeScanner } from "@/components/inventory/BarcodeScanner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { UnitPicker } from "@/components/ui/unit-picker";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { AlertModal } from "@/components/ui/alert-modal";
import {
  INVENTORY_ALL_CATEGORIES_VALUE,
  INVENTORY_CATEGORY_OPTIONS,
  INVENTORY_CUSTOM_CATEGORY_VALUE,
} from "@/components/inventory";
import type {
  FoodFacts,
  InventoryItem,
  KitchenLocation,
  InventoryFilter,
  KitchenLocationId,
} from "@/components/inventory";
interface BarcodeLookupResponse {
  found: boolean;
  product_name?: string;
  brand?: string;
  facts?: Record<string, unknown>;
}

function categoryToFormState(category?: string) {
  const normalized = category?.trim() || "";
  if (!normalized) {
    return { selectedCategory: "", customCategory: "" };
  }
  if (
    (INVENTORY_CATEGORY_OPTIONS as readonly string[]).includes(normalized)
  ) {
    return { selectedCategory: normalized, customCategory: "" };
  }
  return {
    selectedCategory: INVENTORY_CUSTOM_CATEGORY_VALUE,
    customCategory: normalized,
  };
}

type InventoryPrefillData = Partial<InventoryItem> & {
  source?: "local_manual" | "open_food_facts";
  attribution?: { label: "Open Food Facts"; url: string; license: "ODbL" };
  stale?: boolean;
};

function formatTag(tag: string) {
  return tag.replace(/^en:/, "").replace(/[-_]/g, " ");
}

export default function InventoryPage() {
  const inventoryData = useQuery(api.inventory.list, {});
  const preferencesData = useQuery(api.preferences.get, {});
  const removeItem = useMutation(api.inventory.remove);
  const createItem = useMutation(api.inventory.create);
  const updateItem = useMutation(api.inventory.update);

  const items = inventoryData?.items || [];
  const locations = inventoryData?.locations || [];
  const dateFormat = preferencesData?.preferences?.dateFormat || "YYYY-MM-DD";

  const [selectedLocationId, setSelectedLocationId] = useState<
    KitchenLocationId | "all"
  >("all");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [selectedCategory, setSelectedCategory] = useState(
    INVENTORY_ALL_CATEGORIES_VALUE
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [prefillData, setPrefillData] = useState<InventoryPrefillData | null>(
    null
  );
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: "", onConfirm: () => {} });

  const handleAddItem = useCallback(() => {
    setEditingItemId(null);
    setShowAddModal(true);
  }, []);

  const handleEditItem = useCallback((id: string) => {
    setEditingItemId(id);
    setShowAddModal(true);
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setItemToDelete(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const id = itemToDelete;
    if (!id) return;

    setDeletingItems((prev) => new Set(prev).add(id));

    setTimeout(async () => {
      try {
        await removeItem({ id });

        setDeletingItems((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (error) {
        console.error("Error deleting item:", error);
        setDeletingItems((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        const message =
          error instanceof Error
            ? error.message
            : "Failed to delete item. Please try again.";

        setAlertModal({ isOpen: true, message, variant: "error" });
      }
    }, 300);

    setItemToDelete(null);
  }, [itemToDelete, removeItem]);

  const handleScanBarcode = useCallback(() => {
    setShowScanner(true);
  }, []);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    try {
      const response = await fetch(
        `/api/barcode/lookup?code=${encodeURIComponent(barcode)}`
      );

      if (response.status === 404) {
        setConfirmModal({
          isOpen: true,
          message: `Barcode "${barcode}" not found. Would you like to add it manually?`,
          onConfirm: () => {
            setPrefillData({
              name: "",
              barcode,
            });
            setEditingItemId(null);
            setShowAddModal(true);
          },
        });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to lookup barcode");
      }

      const data = (await response.json()) as BarcodeLookupResponse;

      setPrefillData({
        name: data.prefill.name,
        barcode: data.prefill.barcode,
        category: data.prefill.category,
        foodFacts: data.facts as FoodFacts | undefined,
        source: data.source,
        attribution: data.attribution,
        stale: data.stale,
      });
      setEditingItemId(null);
      setShowAddModal(true);

      if (data.stale) {
        setAlertModal({
          isOpen: true,
          message:
            "Using cached food facts. Open Food Facts is currently unavailable.",
          variant: "info",
        });
      }
    } catch (error) {
      console.error("Error looking up barcode:", error);
      setAlertModal({
        isOpen: true,
        message: "Failed to lookup barcode. Please try again.",
        variant: "error",
      });
    }
  }, []);

  const handleViewExpiringSoon = useCallback(() => {
    setFilter("expiring-soon");
  }, []);

  const handleSaveItem = useCallback(
    async (itemData: Partial<InventoryItem>) => {
      try {
        const cleanedData = {
          ...itemData,
          expiresOn: itemData.expiresOn || "",
          category: itemData.category || "",
          notes: itemData.notes || "",
          barcode: itemData.barcode || "",
        };

        if (editingItemId) {
          await updateItem({ id: editingItemId, ...cleanedData });
        } else {
          await createItem(cleanedData);
        }

        setShowAddModal(false);
        setEditingItemId(null);
        setPrefillData(null);
      } catch (error) {
        console.error("Error saving item:", error);

        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to save item. Please try again.",
          variant: "error",
        });
      }
    },
    [editingItemId, createItem, updateItem]
  );

  if (inventoryData === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <KitchenInventoryDashboardView
        locations={locations}
        items={items}
        dateFormat={dateFormat}
        selectedLocationId={selectedLocationId}
        filter={filter}
        selectedCategory={selectedCategory}
        searchQuery={searchQuery}
        onSelectLocation={setSelectedLocationId}
        onChangeFilter={setFilter}
        onSelectCategory={setSelectedCategory}
        onSearchChange={setSearchQuery}
        onScanBarcode={handleScanBarcode}
        onAddItem={handleAddItem}
        onEditItem={handleEditItem}
        onRemoveItem={handleRemoveItem}
        onViewExpiringSoon={handleViewExpiringSoon}
        deletingItems={deletingItems}
      />
      {showScanner && (
        <BarcodeScanner
          isOpen={showScanner}
          onClose={() => setShowScanner(false)}
          onScan={handleBarcodeScanned}
        />
      )}
      {showAddModal && (
        <InventoryItemModal
          item={editingItemId ? items.find((item) => item.id === editingItemId) : undefined}
          prefillData={prefillData}
          locations={locations}
          onSave={handleSaveItem}
          onClose={() => {
            setShowAddModal(false);
            setEditingItemId(null);
            setPrefillData(null);
          }}
        />
      )}
      <ConfirmModal
        isOpen={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Remove item"
        message="Are you sure you want to remove this item from your inventory?"
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
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() =>
          setConfirmModal({ isOpen: false, message: "", onConfirm: () => {} })
        }
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ isOpen: false, message: "", onConfirm: () => {} });
        }}
        title="Confirm"
        message={confirmModal.message}
        confirmText="Yes"
        cancelText="No"
      />
    </>
  );
}

interface InventoryItemModalProps {
  item?: InventoryItem;
  prefillData?: InventoryPrefillData | null;
  locations: KitchenLocation[];
  onSave: (data: Partial<InventoryItem>) => Promise<void>;
  onClose: () => void;
}

function InventoryItemModal({
  item,
  prefillData,
  locations,
  onSave,
  onClose,
}: InventoryItemModalProps) {
  const initialCategoryState = categoryToFormState(
    item?.category || prefillData?.category
  );
  const [formData, setFormData] = useState({
    name: item?.name || prefillData?.name || "",
    locationId: (item?.locationId || prefillData?.locationId ||
      "pantry") as KitchenLocationId,
    quantity: item?.quantity || prefillData?.quantity || 1,
    unit: item?.unit || prefillData?.unit || "count",
    expiresOn: item?.expiresOn || prefillData?.expiresOn || "",
    notes: item?.notes || prefillData?.notes || "",
    barcode: item?.barcode || prefillData?.barcode || "",
  });
  const [selectedCategory, setSelectedCategory] = useState(
    initialCategoryState.selectedCategory
  );
  const [customCategory, setCustomCategory] = useState(
    initialCategoryState.customCategory
  );
  const [saving, setSaving] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const inputClassName =
    "w-full h-10 px-3 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100";
  const textareaClassName =
    "w-full min-h-[72px] px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100";
  const categorySelectOptions = [
    { value: "", label: "No category" },
    ...INVENTORY_CATEGORY_OPTIONS.map((category) => ({
      value: category,
      label: category,
    })),
    {
      value: INVENTORY_CUSTOM_CATEGORY_VALUE,
      label: "Custom category...",
      searchText: "custom",
    },
  ];

  useEffect(() => {
    if (prefillData && !item) {
      const nextCategoryState = categoryToFormState(prefillData.category);
      setFormData((previous) => ({
        ...previous,
        name: prefillData.name || previous.name,
        barcode: prefillData.barcode || previous.barcode,
      }));
      setSelectedCategory(nextCategoryState.selectedCategory);
      setCustomCategory(nextCategoryState.customCategory);
    }
  }, [prefillData, item]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      setAlertModal({ isOpen: true, message: "Name is required", variant: "error" });
      return;
    }

    if (!formData.unit.trim()) {
      setAlertModal({ isOpen: true, message: "Unit is required", variant: "error" });
      return;
    }

    if (
      selectedCategory === INVENTORY_CUSTOM_CATEGORY_VALUE &&
      !customCategory.trim()
    ) {
      setAlertModal({
        isOpen: true,
        message: "Custom category is required",
        variant: "error",
      });
      return;
    }

    const resolvedCategory =
      selectedCategory === INVENTORY_CUSTOM_CATEGORY_VALUE
        ? customCategory.trim()
        : selectedCategory.trim();

    setSaving(true);
    try {
      await onSave({
        name: formData.name,
        locationId: formData.locationId,
        quantity: formData.quantity,
        unit: formData.unit,
        expiresOn: formData.expiresOn || "",
        category: resolvedCategory || "",
        notes: formData.notes || "",
        barcode: formData.barcode || "",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800 p-4 sm:p-6 w-full max-w-md mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4 text-stone-900 dark:text-stone-100">
          {item ? "Edit Item" : "Add Item"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) =>
                setFormData({ ...formData, name: event.target.value })
              }
              className={inputClassName}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Location *
              </label>
              <select
                value={formData.locationId}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    locationId: event.target.value as KitchenLocationId,
                  })
                }
                className={inputClassName}
                required
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Unit *
              </label>
              <UnitPicker
                value={formData.unit}
                onChange={(unit) => setFormData({ ...formData, unit })}
                ingredientName={formData.name}
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Quantity *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.quantity}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    quantity: parseFloat(event.target.value) || 0,
                  })
                }
                className={inputClassName}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Expiration Date
              </label>
              <input
                type="date"
                value={formData.expiresOn}
                onChange={(event) =>
                  setFormData({ ...formData, expiresOn: event.target.value })
                }
                className={inputClassName}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Category
            </label>
            <SearchableSelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={categorySelectOptions}
              placeholder="Select category"
              searchPlaceholder="Search categories..."
              emptyMessage="No matching categories"
              ariaLabel="Select pantry item category"
            />
            {selectedCategory === INVENTORY_CUSTOM_CATEGORY_VALUE && (
              <input
                type="text"
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
                placeholder="Enter custom category"
                className={`${inputClassName} mt-2`}
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(event) =>
                setFormData({ ...formData, notes: event.target.value })
              }
              rows={2}
              className={textareaClassName}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Barcode
            </label>
            <input
              type="text"
              value={formData.barcode}
              onChange={(event) =>
                setFormData({ ...formData, barcode: event.target.value })
              }
              placeholder="UPC/EAN"
              className={inputClassName}
            />
          </div>

          {prefillData?.foodFacts && !item && (
            <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 p-3 space-y-2">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                Scanned Food Facts
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-stone-700 dark:text-stone-300">
                {prefillData.foodFacts.brand && (
                  <span className="px-2 py-1 rounded bg-stone-200/80 dark:bg-stone-800">
                    Brand: {prefillData.foodFacts.brand}
                  </span>
                )}
                {prefillData.foodFacts.nutriscoreGrade && (
                  <span className="px-2 py-1 rounded bg-stone-200/80 dark:bg-stone-800">
                    Nutri-Score {prefillData.foodFacts.nutriscoreGrade.toUpperCase()}
                  </span>
                )}
                {prefillData.foodFacts.novaGroup && (
                  <span className="px-2 py-1 rounded bg-stone-200/80 dark:bg-stone-800">
                    NOVA {prefillData.foodFacts.novaGroup}
                  </span>
                )}
              </div>

              {prefillData.foodFacts.nutritionPer100g && (
                <div className="text-xs text-stone-700 dark:text-stone-300 grid grid-cols-2 gap-x-3 gap-y-1">
                  {prefillData.foodFacts.nutritionPer100g.energyKcal !== undefined && (
                    <span>
                      Energy: {prefillData.foodFacts.nutritionPer100g.energyKcal} kcal
                    </span>
                  )}
                  {prefillData.foodFacts.nutritionPer100g.fatG !== undefined && (
                    <span>Fat: {prefillData.foodFacts.nutritionPer100g.fatG} g</span>
                  )}
                  {prefillData.foodFacts.nutritionPer100g.carbsG !== undefined && (
                    <span>Carbs: {prefillData.foodFacts.nutritionPer100g.carbsG} g</span>
                  )}
                  {prefillData.foodFacts.nutritionPer100g.sugarsG !== undefined && (
                    <span>Sugars: {prefillData.foodFacts.nutritionPer100g.sugarsG} g</span>
                  )}
                  {prefillData.foodFacts.nutritionPer100g.proteinG !== undefined && (
                    <span>Protein: {prefillData.foodFacts.nutritionPer100g.proteinG} g</span>
                  )}
                  {prefillData.foodFacts.nutritionPer100g.saltG !== undefined && (
                    <span>Salt: {prefillData.foodFacts.nutritionPer100g.saltG} g</span>
                  )}
                </div>
              )}

              {prefillData.foodFacts.allergensTags &&
                prefillData.foodFacts.allergensTags.length > 0 && (
                  <p className="text-xs text-stone-700 dark:text-stone-300">
                    Allergens:{" "}
                    {prefillData.foodFacts.allergensTags.map(formatTag).join(", ")}
                  </p>
                )}

              {prefillData.foodFacts.ingredientsText && (
                <p className="text-xs text-stone-700 dark:text-stone-300">
                  Ingredients: {prefillData.foodFacts.ingredientsText.slice(0, 180)}
                  {prefillData.foodFacts.ingredientsText.length > 180 ? "..." : ""}
                </p>
              )}

              {prefillData.attribution && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Data source:{" "}
                  <a
                    href={prefillData.attribution.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {prefillData.attribution.label}
                  </a>{" "}
                  ({prefillData.attribution.license})
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-3 sm:pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
}
