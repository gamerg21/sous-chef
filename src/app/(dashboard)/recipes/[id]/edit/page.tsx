"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { RecipeEditorView } from "@/components/recipes";
import type { Recipe, PantrySnapshotItem } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";

export default function EditRecipePage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [pantrySnapshot, setPantrySnapshot] = useState<PantrySnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });

  const fetchRecipe = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/recipes/${recipeId}`);
      if (!response.ok) {
        if (response.status === 404) {
          router.push("/recipes");
          return;
        }
        throw new Error("Failed to fetch recipe");
      }
      const data = await response.json();
      setRecipe(data);
    } catch (error) {
      console.error("Error fetching recipe:", error);
      router.push("/recipes");
    } finally {
      setLoading(false);
    }
  }, [recipeId, router]);

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
    fetchRecipe();
    fetchInventory();
  }, [fetchRecipe, fetchInventory]);

  const handleBack = useCallback(() => {
    router.push(`/recipes/${recipeId}`);
  }, [router, recipeId]);

  const handleCancel = useCallback(() => {
    router.push(`/recipes/${recipeId}`);
  }, [router, recipeId]);

  const handleSave = useCallback(async (updatedRecipe: Recipe) => {
    try {
      const response = await fetch(`/api/recipes/${recipeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedRecipe),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.details && Array.isArray(error.details)) {
          const errorMessages = error.details
            .map((d: any) => `${d.path.join(".")}: ${d.message}`)
            .join("\n");
          throw new Error(`Validation error:\n${errorMessages}`);
        }
        throw new Error(error.error || "Failed to update recipe");
      }

      router.push(`/recipes/${recipeId}`);
    } catch (error) {
      console.error("Error updating recipe:", error);
      setAlertModal({ isOpen: true, message: error instanceof Error ? error.message : "Failed to update recipe. Please try again.", variant: 'error' });
    }
  }, [router, recipeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  if (!recipe) {
    return null;
  }

  return (
    <>
      <RecipeEditorView
        recipe={recipe}
        pantrySnapshot={pantrySnapshot}
        onBack={handleBack}
        onCancel={handleCancel}
        onSave={handleSave}
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

