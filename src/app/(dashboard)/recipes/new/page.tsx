"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { RecipeEditorView } from "@/components/recipes";
import type { Recipe, PantrySnapshotItem } from "@/components/recipes";

export default function NewRecipePage() {
  const router = useRouter();
  const [pantrySnapshot, setPantrySnapshot] = useState<PantrySnapshotItem[]>([]);

  const fetchInventory = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory");
      if (!response.ok) return;
      const data = await response.json();
      const snapshot: PantrySnapshotItem[] = (data.items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      }));
      setPantrySnapshot(snapshot);
    } catch (error) {
      console.error("Error fetching inventory:", error);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleBack = useCallback(() => {
    router.push("/recipes");
  }, [router]);

  const handleCancel = useCallback(() => {
    router.push("/recipes");
  }, [router]);

  const handleSave = useCallback(async (recipe: Recipe) => {
    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.details && Array.isArray(error.details)) {
          const errorMessages = error.details
            .map((d: any) => `${d.path.join(".")}: ${d.message}`)
            .join("\n");
          throw new Error(`Validation error:\n${errorMessages}`);
        }
        throw new Error(error.error || "Failed to save recipe");
      }

      const saved = await response.json();
      router.push(`/recipes/${saved.id}`);
    } catch (error) {
      console.error("Error saving recipe:", error);
      alert(
        error instanceof Error ? error.message : "Failed to save recipe. Please try again."
      );
    }
  }, [router]);

  return (
    <RecipeEditorView
      pantrySnapshot={pantrySnapshot}
      onBack={handleBack}
      onCancel={handleCancel}
      onSave={handleSave}
    />
  );
}

