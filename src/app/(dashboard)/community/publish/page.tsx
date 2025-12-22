"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PublishRecipeView } from "@/components/community";
import type { Recipe } from "@/components/recipes/types";
import { AlertModal } from "@/components/ui/alert-modal";

export default function PublishRecipePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipeId = searchParams.get("recipeId");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });

  const fetchRecipe = useCallback(async () => {
    if (!recipeId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/recipes/${recipeId}`);
      if (!response.ok) throw new Error("Failed to fetch recipe");
      const data = await response.json();
      setRecipe(data);
    } catch (error) {
      console.error("Error fetching recipe:", error);
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    fetchRecipe();
  }, [fetchRecipe]);

  const handlePublish = useCallback(async (data: { title: string; description?: string; tags: string[]; visibility: "public" | "unlisted" }) => {
    if (!recipeId) {
      setAlertModal({ isOpen: true, message: "No recipe selected", variant: 'warning' });
      return;
    }
    try {
      const response = await fetch("/api/community/recipes/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, visibility: data.visibility }),
      });
      if (!response.ok) throw new Error("Failed to publish recipe");
      setAlertModal({ isOpen: true, message: "Recipe published successfully!", variant: 'success' });
      setTimeout(() => router.push("/community"), 1000);
    } catch (error) {
      console.error("Error publishing recipe:", error);
      setAlertModal({ isOpen: true, message: "Failed to publish recipe. Please try again.", variant: 'error' });
    }
  }, [recipeId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-stone-600 dark:text-stone-400 mb-4">No recipe selected</p>
          <button
            onClick={() => router.push("/recipes")}
            className="text-emerald-600 hover:text-emerald-700"
          >
            Go to Recipes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PublishRecipeView
        draft={{
          title: recipe.title,
          description: recipe.description,
          tags: recipe.tags || [],
          visibility: recipe.visibility === "public" || recipe.visibility === "unlisted" 
            ? recipe.visibility 
            : "public",
        }}
        onPublish={handlePublish}
        onBack={() => router.back()}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
}

