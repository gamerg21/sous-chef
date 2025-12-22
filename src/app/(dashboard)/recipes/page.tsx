"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RecipeLibraryView } from "@/components/recipes";
import type { Recipe, PantrySnapshotItem } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pantrySnapshot, setPantrySnapshot] = useState<PantrySnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | "all">("all");
  const [sort, setSort] = useState<"recently-updated" | "time-asc" | "title-asc">("recently-updated");
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null);

  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/recipes");
      if (!response.ok) throw new Error("Failed to fetch recipes");
      const data = await response.json();
      setRecipes(data.recipes || []);
    } catch (error) {
      console.error("Error fetching recipes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory");
      if (!response.ok) return;
      const data = await response.json();
      // Transform inventory items to pantry snapshot
      const snapshot: PantrySnapshotItem[] = (data.items || []).map((item: { id: string; name: string; quantity: number | null; unit: string | null }) => ({
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
    fetchRecipes();
    fetchInventory();
  }, [fetchRecipes, fetchInventory]);

  const handleOpenRecipe = useCallback((id: string) => {
    router.push(`/recipes/${id}`);
  }, [router]);

  const handleCreateRecipe = useCallback(() => {
    router.push("/recipes/new");
  }, [router]);

  const handleImportRecipe = useCallback(() => {
    // TODO: Implement import flow
    setAlertModal({ isOpen: true, message: "Recipe import coming soon!", variant: 'info' });
  }, []);

  const handleExportAll = useCallback(() => {
    const dataStr = JSON.stringify(recipes, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `recipes-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [recipes]);

  const handleEditRecipe = useCallback((id: string) => {
    router.push(`/recipes/${id}/edit`);
  }, [router]);

  const handleToggleFavorite = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/recipes/${id}/favorite`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Failed to toggle favorite");
      await fetchRecipes();
    } catch (error) {
      console.error("Error toggling favorite:", error);
      setAlertModal({ isOpen: true, message: "Failed to toggle favorite. Please try again.", variant: 'error' });
    }
  }, [fetchRecipes]);

  const handleDeleteRecipe = useCallback((id: string) => {
    setRecipeToDelete(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const id = recipeToDelete;
    if (!id) return;

    try {
      const response = await fetch(`/api/recipes/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete recipe");
      await fetchRecipes();
      setRecipeToDelete(null);
    } catch (error) {
      console.error("Error deleting recipe:", error);
      setAlertModal({ isOpen: true, message: "Failed to delete recipe. Please try again.", variant: 'error' });
      setRecipeToDelete(null);
    }
  }, [recipeToDelete, fetchRecipes]);

  // Extract suggested tags from all recipes
  const suggestedTags = Array.from(
    new Set(recipes.flatMap((r) => r.tags || []))
  ).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <RecipeLibraryView
        recipes={recipes}
        pantrySnapshot={pantrySnapshot}
        suggestedTags={suggestedTags}
        searchQuery={searchQuery}
        activeTag={activeTag}
        sort={sort}
        onSearchChange={setSearchQuery}
        onSetTag={setActiveTag}
        onSetSort={setSort}
        onOpenRecipe={handleOpenRecipe}
        onCreateRecipe={handleCreateRecipe}
        onImportRecipe={handleImportRecipe}
        onExportAll={handleExportAll}
        onEditRecipe={handleEditRecipe}
        onToggleFavorite={handleToggleFavorite}
        onDeleteRecipe={handleDeleteRecipe}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
      <ConfirmModal
        isOpen={recipeToDelete !== null}
        onClose={() => setRecipeToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete recipe"
        message="Are you sure you want to delete this recipe?"
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </>
  );
}
