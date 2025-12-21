"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { CommunityRecipeDetailView } from "@/components/community";
import type { CommunityRecipe } from "@/components/community/types";

export default function CommunityRecipeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [recipe, setRecipe] = useState<CommunityRecipe | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRecipe = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/community/recipes/${id}`);
      if (!response.ok) throw new Error("Failed to fetch recipe");
      const data = await response.json();
      setRecipe(data);
    } catch (error) {
      console.error("Error fetching recipe:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchRecipe();
    }
  }, [id, fetchRecipe]);

  const handleSaveRecipe = useCallback(async () => {
    if (!recipe) return;
    try {
      const response = await fetch(`/api/community/recipes/${recipe.id}/save`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to save recipe");
      alert("Recipe saved to your library!");
    } catch (error) {
      console.error("Error saving recipe:", error);
      alert("Failed to save recipe. Please try again.");
    }
  }, [recipe]);

  const handleLike = useCallback(async () => {
    if (!recipe) return;
    try {
      const response = await fetch(`/api/community/recipes/${recipe.id}/like`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to toggle like");
      await fetchRecipe();
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  }, [recipe, fetchRecipe]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Recipe not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CommunityRecipeDetailView
        recipe={recipe}
        onSave={handleSaveRecipe}
        onLike={handleLike}
        onBack={() => router.back()}
      />
    </div>
  );
}

