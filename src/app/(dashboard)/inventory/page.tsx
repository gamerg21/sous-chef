"use client";

import { useEffect, useState, useCallback } from "react";
import { KitchenInventoryDashboardView } from "@/components/inventory";
import { BarcodeScanner } from "@/components/inventory/BarcodeScanner";
import type {
  InventoryItem,
  KitchenLocation,
  InventoryFilter,
  KitchenLocationId,
} from "@/components/inventory";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<KitchenLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<KitchenLocationId | "all">("all");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [prefillData, setPrefillData] = useState<Partial<InventoryItem> | null>(null);
  const [dateFormat, setDateFormat] = useState("YYYY-MM-DD");

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/inventory");
      if (!response.ok) throw new Error("Failed to fetch inventory");
      const data = await response.json();
      setItems(data.items || []);
      setLocations(data.locations || []);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPreferences = useCallback(async () => {
    try {
      const response = await fetch("/api/user/preferences");
      if (!response.ok) return;
      const data = await response.json();
      setDateFormat(data.preferences?.dateFormat || "YYYY-MM-DD");
    } catch (error) {
      console.error("Error fetching preferences:", error);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
    fetchPreferences();
  }, [fetchInventory, fetchPreferences]);

  const handleAddItem = useCallback(() => {
    setEditingItemId(null);
    setShowAddModal(true);
  }, []);

  const handleEditItem = useCallback((id: string) => {
    setEditingItemId(id);
    setShowAddModal(true);
  }, []);

  const handleRemoveItem = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to remove this item?")) return;

    try {
      const response = await fetch(`/api/inventory/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete item");
      await fetchInventory();
    } catch (error) {
      console.error("Error deleting item:", error);
      alert("Failed to delete item. Please try again.");
    }
  }, [fetchInventory]);

  const handleScanBarcode = useCallback(() => {
    setShowScanner(true);
  }, []);

  const handleBarcodeScanned = useCallback(async (barcode: string) => {
    try {
      // Look up the barcode
      const response = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(barcode)}`);
      
      if (response.status === 404) {
        // Barcode not found - allow user to create mapping
        const shouldCreate = confirm(
          `Barcode "${barcode}" not found. Would you like to add it manually?`
        );
        if (shouldCreate) {
          setPrefillData({
            name: "",
            barcode: barcode,
          });
          setEditingItemId(null);
          setShowAddModal(true);
        }
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to lookup barcode");
      }

      const data = await response.json();
      
      // Pre-fill the form with the scanned item
      setPrefillData({
        name: data.foodItem.name,
        barcode: data.barcode.code,
      });
      setEditingItemId(null);
      setShowAddModal(true);
    } catch (error) {
      console.error("Error looking up barcode:", error);
      alert("Failed to lookup barcode. Please try again.");
    }
  }, []);

  const handleViewExpiringSoon = useCallback(() => {
    setFilter("expiring-soon");
  }, []);

  const handleSaveItem = useCallback(async (itemData: Partial<InventoryItem>) => {
    try {
      const url = editingItemId ? `/api/inventory/${editingItemId}` : "/api/inventory";
      const method = editingItemId ? "PUT" : "POST";

      // Clean up the data: keep empty strings as empty strings (Zod will handle them)
      const cleanedData = {
        ...itemData,
        expiresOn: itemData.expiresOn || "",
        category: itemData.category || "",
        notes: itemData.notes || "",
        barcode: itemData.barcode || "",
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanedData),
      });

      if (!response.ok) {
        const error = await response.json();
        // Show detailed validation errors if available
        if (error.details && Array.isArray(error.details)) {
          const errorMessages = error.details.map((d: any) => `${d.path.join('.')}: ${d.message}`).join('\n');
          throw new Error(`Validation error:\n${errorMessages}`);
        }
        throw new Error(error.error || "Failed to save item");
      }

      setShowAddModal(false);
      setEditingItemId(null);
      await fetchInventory();
    } catch (error) {
      console.error("Error saving item:", error);
      alert(error instanceof Error ? error.message : "Failed to save item. Please try again.");
    }
  }, [editingItemId, fetchInventory]);

  if (loading) {
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
        searchQuery={searchQuery}
        onSelectLocation={setSelectedLocationId}
        onChangeFilter={setFilter}
        onSearchChange={setSearchQuery}
        onScanBarcode={handleScanBarcode}
        onAddItem={handleAddItem}
        onEditItem={handleEditItem}
        onRemoveItem={handleRemoveItem}
        onViewExpiringSoon={handleViewExpiringSoon}
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
          item={editingItemId ? items.find((i) => i.id === editingItemId) : undefined}
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
    </>
  );
}

interface InventoryItemModalProps {
  item?: InventoryItem;
  prefillData?: Partial<InventoryItem> | null;
  locations: KitchenLocation[];
  onSave: (data: Partial<InventoryItem>) => Promise<void>;
  onClose: () => void;
}

function InventoryItemModal({ item, prefillData, locations, onSave, onClose }: InventoryItemModalProps) {
  const [formData, setFormData] = useState({
    name: item?.name || prefillData?.name || "",
    locationId: (item?.locationId || prefillData?.locationId || "pantry") as KitchenLocationId,
    quantity: item?.quantity || prefillData?.quantity || 1,
    unit: (item?.unit || prefillData?.unit || "count") as "count" | "g" | "kg" | "oz" | "lb" | "ml" | "l",
    expiresOn: item?.expiresOn || prefillData?.expiresOn || "",
    category: item?.category || prefillData?.category || "",
    notes: item?.notes || prefillData?.notes || "",
    barcode: item?.barcode || prefillData?.barcode || "",
  });
  const [saving, setSaving] = useState(false);

  // Update form data when prefillData changes (e.g., after scanning)
  useEffect(() => {
    if (prefillData && !item) {
      setFormData((prev) => ({
        ...prev,
        name: prefillData.name || prev.name,
        barcode: prefillData.barcode || prev.barcode,
      }));
    }
  }, [prefillData, item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Name is required");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: formData.name,
        locationId: formData.locationId,
        quantity: formData.quantity,
        unit: formData.unit,
        expiresOn: formData.expiresOn || "",
        category: formData.category || "",
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
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800 p-6 w-full max-w-md mx-4 shadow-xl"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4 text-stone-900 dark:text-stone-100">
          {item ? "Edit Item" : "Add Item"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Location *
              </label>
              <select
                value={formData.locationId}
                onChange={(e) =>
                  setFormData({ ...formData, locationId: e.target.value as KitchenLocationId })
                }
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
                required
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Unit *
              </label>
              <select
                value={formData.unit}
                onChange={(e) =>
                  setFormData({ ...formData, unit: e.target.value as typeof formData.unit })
                }
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
                required
              >
                <option value="count">count</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="oz">oz</option>
                <option value="lb">lb</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Quantity *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
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
              onChange={(e) => setFormData({ ...formData, expiresOn: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Category
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., Dairy, Produce"
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Barcode
            </label>
            <input
              type="text"
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              placeholder="UPC/EAN"
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
            />
          </div>

          <div className="flex gap-3 pt-4">
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
    </div>
  );
}
