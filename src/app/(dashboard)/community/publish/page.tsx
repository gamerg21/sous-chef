"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PublishRecipeView } from "@/components/community";
import type { Recipe } from "@/components/recipes/types";

export default function PublishRecipePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipeId = searchParams.get("recipeId");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

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
      alert("No recipe selected");
      return;
    }
    try {
      const response = await fetch("/api/community/recipes/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, visibility: data.visibility }),
      });
      if (!response.ok) throw new Error("Failed to publish recipe");
      alert("Recipe published successfully!");
      router.push("/community");
    } catch (error) {
      console.error("Error publishing recipe:", error);
      alert("Failed to publish recipe. Please try again.");
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
    </div>
  );
}

