"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { RecipeDetailView } from "@/components/recipes";
import type { Recipe, PantrySnapshotItem } from "@/components/recipes";

export default function RecipeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [pantrySnapshot, setPantrySnapshot] = useState<PantrySnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    router.push("/recipes");
  }, [router]);

  const handleCook = useCallback((id: string) => {
    router.push(`/cooking?recipeId=${id}`);
  }, [router]);

  const handleEdit = useCallback((id: string) => {
    router.push(`/recipes/${id}/edit`);
  }, [router]);

  const handleToggleFavorite = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/recipes/${id}/favorite`, {
        method: "PATCH",
      });
      if (!response.ok) throw new Error("Failed to toggle favorite");
      await fetchRecipe();
    } catch (error) {
      console.error("Error toggling favorite:", error);
      alert("Failed to toggle favorite. Please try again.");
    }
  }, [fetchRecipe]);

  const handleUploadPhoto = useCallback(async (id: string, file: File) => {
    // TODO: Implement photo upload
    alert("Photo upload coming soon!");
  }, []);

  const handleRemovePhoto = useCallback(async (id: string) => {
    // TODO: Implement photo removal
    alert("Photo removal coming soon!");
  }, []);

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
    <RecipeDetailView
      recipe={recipe}
      pantrySnapshot={pantrySnapshot}
      onBack={handleBack}
      onCook={handleCook}
      onEdit={handleEdit}
      onToggleFavorite={handleToggleFavorite}
      onUploadPhoto={handleUploadPhoto}
      onRemovePhoto={handleRemovePhoto}
    />
  );
}

