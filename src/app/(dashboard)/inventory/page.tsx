"use client";

import { unitLabel } from "@/lib/units";
import { NUTRIENT_FIELDS, readNutrition, type NutrientKey, type NutritionPer100g } from "@/lib/nutrition";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { KitchenInventoryDashboardView } from "@/components/inventory";
import { BarcodeScanner } from "@/components/inventory/BarcodeScanner";
import { UnitMenu } from "@/components/ui/unit-menu";
import { Calendar, daysFromTodayISO, formatDisplay } from "@/components/ui/date-picker";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
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
import { PageLoader } from "@/components/ui/page-loader";
import { Apple, CalendarDays, Check, ChevronDown, Loader2, NotebookPen, Package, Refrigerator, ScanBarcode, ScanLine, Search, Snowflake, Tag } from "lucide-react";
import { Collapse } from "@/components/ui/collapse";
interface BarcodeLookupResponse {
  found: boolean;
  prefill: {
    name?: string;
    barcode?: string;
    category?: string;
  };
  facts?: Record<string, unknown>;
  source?: "local_manual" | "open_food_facts";
  attribution?: { label: "Open Food Facts"; url: string; license: "ODbL" };
  stale?: boolean;
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
  const lookupBarcode = useAction(api.barcodes.lookup);

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
  const [editingItemId, setEditingItemId] = useState<Id<"inventoryItems"> | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Deep link from elsewhere (e.g. a recipe's "Add facts"): /inventory?edit=<id>.
  const hasItems = inventoryData !== undefined;
  useEffect(() => {
    if (!hasItems) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("edit");
    if (!id) return;
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url);
    if (!inventoryData.items.some((item) => item.id === id)) return;
    setEditingItemId(id as Id<"inventoryItems">);
    setShowAddModal(true);
  }, [hasItems, inventoryData]);
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
    setEditingItemId(id as Id<"inventoryItems">);
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
        await removeItem({ id: id as Id<"inventoryItems"> });

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
      const data = (await lookupBarcode({ code: barcode })) as BarcodeLookupResponse;

      if (!data.found) {
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
  }, [lookupBarcode]);

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
          await updateItem({
            id: editingItemId as Id<"inventoryItems">,
            name: cleanedData.name,
            locationId: cleanedData.locationId,
            quantity: cleanedData.quantity,
            unit: cleanedData.unit,
            expiresOn: cleanedData.expiresOn,
            category: cleanedData.category,
            notes: cleanedData.notes,
            barcode: cleanedData.barcode,
            nutritionPer100g: itemData.nutritionPer100g,
          });
        } else {
          if (!itemData.name || !itemData.locationId || !itemData.quantity || !itemData.unit) {
            throw new Error("Name, location, quantity, and unit are required.");
          }
          await createItem({
            name: itemData.name,
            locationId: itemData.locationId,
            quantity: itemData.quantity,
            unit: itemData.unit,
            expiresOn: cleanedData.expiresOn,
            category: cleanedData.category,
            notes: cleanedData.notes,
            barcode: cleanedData.barcode,
            nutritionPer100g: itemData.nutritionPer100g ?? undefined,
          });
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
      <PageLoader />
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

function nutritionToForm(nutrition?: NutritionPer100g): Record<NutrientKey, string> {
  return Object.fromEntries(
    NUTRIENT_FIELDS.map(({ key }) => [key, nutrition?.[key] !== undefined ? `${nutrition[key]}` : ""])
  ) as Record<NutrientKey, string>;
}

function formToNutrition(form: Record<NutrientKey, string>): NutritionPer100g | undefined {
  const result: NutritionPer100g = {};
  for (const { key } of NUTRIENT_FIELDS) {
    const value = Number(form[key].trim().replace(",", "."));
    if (form[key].trim() && Number.isFinite(value) && value >= 0) result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

const EXPIRY_SHORTCUTS = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "6 months", days: 182 },
];

function LocationIcon({ id, className }: { id: KitchenLocationId; className?: string }) {
  const Icon = id === "fridge" ? Refrigerator : id === "freezer" ? Snowflake : Package;
  return <Icon className={className} strokeWidth={1.75} aria-hidden="true" />;
}

function LocationBadge({ id }: { id: KitchenLocationId }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
      <LocationIcon id={id} className="h-4 w-4" />
    </span>
  );
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
  // Only one inline panel is open at a time, like a settings sheet.
  const [panel, setPanel] = useState<"unit" | "location" | "expires" | "category" | null>(null);
  const togglePanel = (next: NonNullable<typeof panel>) =>
    setPanel((current) => (current === next ? null : next));
  const currentLocation = locations.find((location) => location.id === formData.locationId);
  const [categoryQuery, setCategoryQuery] = useState("");
  const initialNutrition =
    readNutrition(item?.nutritionPer100g) ??
    readNutrition(item?.foodFacts?.nutritionPer100g) ??
    readNutrition(prefillData?.foodFacts?.nutritionPer100g);
  const [nutrition, setNutrition] = useState<Record<NutrientKey, string>>(() => nutritionToForm(initialNutrition));
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const nutritionCount = Object.values(nutrition).filter((value) => value.trim()).length;
  const lookupBarcode = useAction(api.barcodes.lookup);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookedUpCode, setLookedUpCode] = useState(prefillData?.foodFacts ? prefillData.barcode ?? "" : "");
  const [scanned, setScanned] = useState<{
    foodFacts?: FoodFacts;
    attribution?: InventoryPrefillData["attribution"];
  }>({ foodFacts: prefillData?.foodFacts, attribution: prefillData?.attribution });
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const eyebrowClassName =
    "block text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400";
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

  const filteredCategories = categorySelectOptions.filter((option) =>
    `${option.label} ${option.searchText ?? ""}`
      .toLowerCase()
      .includes(categoryQuery.trim().toLowerCase())
  );
  const categoryLabel =
    selectedCategory === INVENTORY_CUSTOM_CATEGORY_VALUE
      ? customCategory.trim() || "Custom category"
      : selectedCategory || "";

  // Fill blanks from the product database; never overwrite what the user typed.
  const lookUp = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setFormData((previous) => ({ ...previous, barcode: trimmed }));
    setLookedUpCode(trimmed);
    setLookingUp(true);
    try {
      const data = (await lookupBarcode({ code: trimmed })) as BarcodeLookupResponse;
      if (!data.found) {
        setAlertModal({
          isOpen: true,
          message: `No product found for ${trimmed}. You can still save it with this barcode.`,
          variant: "info",
        });
        return;
      }
      setFormData((previous) => ({
        ...previous,
        name: previous.name.trim() ? previous.name : data.prefill.name || previous.name,
      }));
      if (!selectedCategory && data.prefill.category) {
        const next = categoryToFormState(data.prefill.category);
        setSelectedCategory(next.selectedCategory);
        setCustomCategory(next.customCategory);
      }
      setScanned({ foodFacts: data.facts as FoodFacts | undefined, attribution: data.attribution });
      const scannedNutrition = readNutrition((data.facts as FoodFacts | undefined)?.nutritionPer100g);
      if (scannedNutrition) {
        setNutrition((previous) =>
          Object.values(previous).some((value) => value.trim()) ? previous : nutritionToForm(scannedNutrition)
        );
      }
    } catch (error) {
      console.error("Error looking up barcode:", error);
      setAlertModal({ isOpen: true, message: "Couldn’t look up that barcode. Please try again.", variant: "error" });
    } finally {
      setLookingUp(false);
    }
  };

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
        // null clears facts that were removed; undefined leaves them untouched.
        nutritionPer100g: formToNutrition(nutrition) ?? (item?.nutritionPer100g ? null : undefined),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={item ? "Edit item" : "Add item"}>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Essentials, grouped in one card like a receipt: name and amount up
              top, where and how long below. */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-900/40">
            <div className="flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <label htmlFor="inventory-name" className={eyebrowClassName}>
                  Item
                </label>
                <input id="inventory-name" autoFocus
                  type="text"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                  placeholder="What are you adding?"
                  className="mt-1 w-full bg-transparent text-xl font-semibold tracking-tight text-stone-900 placeholder:font-medium placeholder:text-stone-400 focus:outline-none dark:text-stone-100 dark:placeholder:text-stone-600"
                  style={{ fontFamily: "var(--font-heading)" }}
                  required
                />
              </div>
              <div className="w-28 shrink-0 text-right">
                <label htmlFor="inventory-quantity" className={eyebrowClassName}>
                  Quantity
                </label>
                <input id="inventory-quantity"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  value={formData.quantity}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      quantity: parseFloat(event.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full bg-transparent text-right text-xl font-semibold tabular-nums text-stone-900 focus:outline-none dark:text-stone-100 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={{ fontFamily: "var(--font-heading)" }}
                  required
                />
              </div>
            </div>

            <div className="border-t border-stone-200 dark:border-stone-800">
              <button
                type="button"
                aria-label={`Unit: ${formData.unit || "not set"}`}
                aria-expanded={panel === "unit"}
                aria-controls="inventory-unit-menu"
                onClick={() => togglePanel("unit")}
                className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-stone-100/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/30"
              >
                <span className={eyebrowClassName} aria-hidden="true">Unit</span>
                <span className={`ml-auto truncate text-base ${formData.unit ? "text-stone-900 dark:text-stone-100" : "text-stone-400"}`}>
                  {unitLabel(formData.unit, formData.quantity) || "Choose a unit"}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300 ${panel === "unit" ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>
              <Collapse open={panel === "unit"}>
                <div id="inventory-unit-menu" className="border-t border-stone-200 dark:border-stone-800">
                  <UnitMenu
                    active={panel === "unit"}
                    value={formData.unit}
                    onChange={(unit) => setFormData((previous) => ({ ...previous, unit }))}
                    onDone={() => setPanel(null)}
                    ingredientName={formData.name}
                  />
                </div>
              </Collapse>
            </div>

            <div className="grid grid-cols-2 divide-x divide-stone-200 border-t border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              <div className="p-4">
                <span id="inventory-location-label" className={eyebrowClassName}>Location</span>
                <button
                  type="button"
                  aria-label={`Location: ${currentLocation?.name ?? "not set"}`}
                  aria-expanded={panel === "location"}
                  aria-controls="inventory-location-options"
                  onClick={() => togglePanel("location")}
                  className="mt-1.5 -ml-1 flex min-h-10 items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-base text-stone-900 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-stone-100 dark:hover:bg-stone-800/60"
                >
                  <LocationBadge id={formData.locationId} />
                  <span className="truncate">{currentLocation?.name ?? "Choose"}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300 ${panel === "location" ? "rotate-180" : ""}`} strokeWidth={1.75} />
                </button>
              </div>
              <div className="p-4">
                <span className={eyebrowClassName} aria-hidden="true">
                  Expires
                </span>
                <button
                  type="button"
                  aria-label={`Expires: ${formData.expiresOn ? formatDisplay(formData.expiresOn) : "no expiration"}`}
                  aria-expanded={panel === "expires"}
                  aria-controls="inventory-expires-calendar"
                  onClick={() => togglePanel("expires")}
                  className="mt-1.5 -ml-2 flex min-h-10 w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-full px-2 py-1 text-left text-base hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/60"
                >
                  <CalendarDays className="h-5 w-5 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
                  <span className={`truncate ${formData.expiresOn ? "text-stone-900 dark:text-stone-100" : "text-stone-400"}`}>
                    {formData.expiresOn ? formatDisplay(formData.expiresOn) : "No expiration"}
                  </span>
                </button>
              </div>
            </div>

            <Collapse open={panel === "location"}>
              <div
                id="inventory-location-options"
                role="radiogroup"
                aria-labelledby="inventory-location-label"
                className="grid grid-cols-3 gap-1.5 border-t border-stone-200 p-2 dark:border-stone-800"
              >
                {locations.map((location) => {
                  const selected = location.id === formData.locationId;
                  return (
                    <button
                      key={location.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setFormData({ ...formData, locationId: location.id });
                        setPanel(null);
                      }}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 text-sm font-medium ${
                        selected
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                          : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60"
                      }`}
                    >
                      <LocationIcon id={location.id} className="h-4 w-4" />
                      {location.name}
                    </button>
                  );
                })}
              </div>
            </Collapse>

            <Collapse open={panel === "expires"}>
              <div id="inventory-expires-calendar" className="border-t border-stone-200 p-4 dark:border-stone-800">
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {EXPIRY_SHORTCUTS.map((shortcut) => (
                    <button
                      key={shortcut.label}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, expiresOn: daysFromTodayISO(shortcut.days) });
                        setPanel(null);
                      }}
                      className="min-h-9 rounded-full border border-stone-200 px-3 text-sm text-stone-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40"
                    >
                      {shortcut.label}
                    </button>
                  ))}
                  {formData.expiresOn && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, expiresOn: "" });
                        setPanel(null);
                      }}
                      className="min-h-9 rounded-full px-3 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      No expiration
                    </button>
                  )}
                </div>
                {/* Remount on open so it starts on the selected month. */}
                <Calendar
                  key={panel === "expires" ? "open" : "closed"}
                  size="comfortable"
                  value={formData.expiresOn}
                  onSelect={(expiresOn) => {
                    setFormData({ ...formData, expiresOn });
                    setPanel(null);
                  }}
                />
              </div>
            </Collapse>
          </div>

          <section>
            <h3 id="inventory-category-label" className={`${eyebrowClassName} mb-2 px-1`}>Category</h3>
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800">
              <button
                type="button"
                aria-label={`Category: ${categoryLabel || "none"}`}
                aria-expanded={panel === "category"}
                aria-controls="inventory-category-options"
                onClick={() => {
                  if (panel !== "category") setCategoryQuery("");
                  togglePanel("category");
                }}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left text-base focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  panel === "category" ? "rounded-b-none bg-stone-50 dark:bg-stone-900/50" : "hover:bg-stone-50 dark:hover:bg-stone-900/40"
                }`}
              >
                <Tag className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
                <span className={`flex-1 truncate ${categoryLabel ? "text-stone-900 dark:text-stone-100" : "text-stone-400"}`}>
                  {categoryLabel || "Select category"}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300 ${panel === "category" ? "rotate-180" : ""}`} strokeWidth={1.75} />
              </button>

              <Collapse open={panel === "category"}>
                <div className="border-t border-stone-200 dark:border-stone-800">
                  <div className="p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
                      <input
                        type="search"
                        value={categoryQuery}
                        onChange={(event) => setCategoryQuery(event.target.value)}
                        placeholder="Search categories"
                        aria-label="Search categories"
                        className="h-10 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                      />
                    </div>
                  </div>
                  <div
                    id="inventory-category-options"
                    role="listbox"
                    aria-labelledby="inventory-category-label"
                    className="max-h-56 overflow-y-auto overscroll-contain border-t border-stone-200 px-2 py-1 dark:border-stone-800"
                  >
                    {filteredCategories.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-stone-500 dark:text-stone-400">No matching categories</p>
                    ) : (
                      filteredCategories.map((option) => {
                        const selected = option.value === selectedCategory;
                        return (
                          <button
                            key={option.value || "none"}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              setSelectedCategory(option.value);
                              if (option.value !== INVENTORY_CUSTOM_CATEGORY_VALUE) setPanel(null);
                            }}
                            className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm ${
                              selected
                                ? "bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                                : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60"
                            }`}
                          >
                            <span className="truncate">{option.label}</span>
                            {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </Collapse>

              <Collapse open={selectedCategory === INVENTORY_CUSTOM_CATEGORY_VALUE}>
                <div className="border-t border-stone-200 p-3 dark:border-stone-800">
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(event) => setCustomCategory(event.target.value)}
                    placeholder="Name your category"
                    aria-label="Custom category"
                    className="h-10 w-full rounded-xl bg-stone-100 px-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:bg-stone-900 dark:text-stone-100"
                  />
                </div>
              </Collapse>
            </div>
          </section>

          <section>
            <h3 className={`${eyebrowClassName} mb-2 px-1`}>Optional details</h3>
            <div className="divide-y divide-stone-200 rounded-2xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              <label className="flex items-start gap-3 px-4 py-3 focus-within:bg-stone-50 dark:focus-within:bg-stone-900/40 first:rounded-t-2xl">
                <NotebookPen className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
                <span className="sr-only">Notes</span>
                <textarea id="inventory-notes"
                  value={formData.notes}
                  onChange={(event) =>
                    setFormData({ ...formData, notes: event.target.value })
                  }
                  rows={formData.notes ? 3 : 1}
                  placeholder="Add a note"
                  className="min-h-6 w-full resize-none bg-transparent text-base text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
                />
              </label>
              <div className="flex items-center gap-3 px-4 py-2 focus-within:bg-stone-50 dark:focus-within:bg-stone-900/40 last:rounded-b-2xl">
                <ScanBarcode className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
                <input id="inventory-barcode"
                  type="text"
                  inputMode="numeric"
                  aria-label="Barcode"
                  value={formData.barcode}
                  onChange={(event) =>
                    setFormData({ ...formData, barcode: event.target.value })
                  }
                  onKeyDown={(event) => {
                    // Enter looks the code up instead of submitting the form.
                    if (event.key === "Enter" && formData.barcode.trim()) {
                      event.preventDefault();
                      void lookUp(formData.barcode);
                    }
                  }}
                  placeholder="Barcode (UPC/EAN)"
                  className="min-h-10 w-full min-w-0 bg-transparent text-base tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
                />
                {lookingUp ? (
                  <span className="flex shrink-0 items-center gap-1.5 px-2 text-sm text-stone-500" role="status">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
                    Looking up…
                  </span>
                ) : formData.barcode.trim() && formData.barcode.trim() !== lookedUpCode ? (
                  <button
                    type="button"
                    onClick={() => void lookUp(formData.barcode)}
                    className="min-h-9 shrink-0 rounded-full px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  >
                    Look up
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                >
                  <ScanLine className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Scan
                </button>
              </div>
              <div className="last:rounded-b-2xl">
                <button
                  type="button"
                  aria-expanded={nutritionOpen}
                  aria-controls="inventory-nutrition"
                  onClick={() => setNutritionOpen((open) => !open)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-stone-50 dark:hover:bg-stone-900/40"
                >
                  <Apple className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden="true" />
                  <span className={`flex-1 text-base ${nutritionCount ? "text-stone-900 dark:text-stone-100" : "text-stone-400"}`}>
                    {nutritionCount ? `Nutrition facts · ${nutritionCount} of ${NUTRIENT_FIELDS.length}` : "Add nutrition facts"}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300 ${nutritionOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
                </button>
                <Collapse open={nutritionOpen}>
                  <div id="inventory-nutrition" className="border-t border-stone-200 p-4 dark:border-stone-800">
                    <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
                      Per 100 g, as printed on the label. Recipes use these to estimate their nutrition.
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {NUTRIENT_FIELDS.map(({ key, label, unit }) => (
                        <label key={key} className="rounded-xl bg-stone-100 px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500/30 dark:bg-stone-900">
                          <span className="block text-[11px] text-stone-500 dark:text-stone-400">{label}</span>
                          <span className="flex items-baseline gap-1">
                            <input
                              value={nutrition[key]}
                              onChange={(event) => setNutrition((previous) => ({ ...previous, [key]: event.target.value }))}
                              inputMode="decimal"
                              placeholder="—"
                              className="w-full min-w-0 bg-transparent text-base font-semibold tabular-nums text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-stone-100"
                            />
                            <span className="text-xs text-stone-500">{unit}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </Collapse>
              </div>
            </div>
          </section>

          {scanned.foodFacts && (
            <div className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40 p-3 space-y-2">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                Food facts
              </p>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Its nutrition is filled in under Nutrition facts below.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-stone-700 dark:text-stone-300">
                {scanned.foodFacts.brand && (
                  <span className="px-2 py-1 rounded bg-stone-200/80 dark:bg-stone-800">
                    Brand: {scanned.foodFacts.brand}
                  </span>
                )}
                {scanned.foodFacts.nutriscoreGrade && (
                  <span className="px-2 py-1 rounded bg-stone-200/80 dark:bg-stone-800">
                    Nutri-Score {scanned.foodFacts.nutriscoreGrade.toUpperCase()}
                  </span>
                )}
                {scanned.foodFacts.novaGroup && (
                  <span className="px-2 py-1 rounded bg-stone-200/80 dark:bg-stone-800">
                    NOVA {scanned.foodFacts.novaGroup}
                  </span>
                )}
              </div>

              {scanned.foodFacts.allergensTags &&
                scanned.foodFacts.allergensTags.length > 0 && (
                  <p className="text-xs text-stone-700 dark:text-stone-300">
                    Allergens:{" "}
                    {scanned.foodFacts.allergensTags.map(formatTag).join(", ")}
                  </p>
                )}

              {scanned.foodFacts.ingredientsText && (
                <p className="text-xs text-stone-700 dark:text-stone-300">
                  Ingredients: {scanned.foodFacts.ingredientsText.slice(0, 180)}
                  {scanned.foodFacts.ingredientsText.length > 180 ? "..." : ""}
                </p>
              )}

              {scanned.attribution && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Data source:{" "}
                  <a
                    href={scanned.attribution.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {scanned.attribution.label}
                  </a>{" "}
                  ({scanned.attribution.license})
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-xl px-4 py-2 font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 flex-[2] rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : item ? "Save changes" : "Add to kitchen"}
            </button>
          </div>
        </form>
      {scanning && (
        <BarcodeScanner
          isOpen
          onClose={() => setScanning(false)}
          onScan={(code) => void lookUp(code)}
        />
      )}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </Modal>
  );
}
