"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CommunityRecipeFeedView } from "@/components/community";
import type { CommunityRecipe } from "@/components/community/types";

export default function CommunityRecipesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [tag, setTag] = useState(searchParams.get("tag") || "");

  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      if (tag) params.set("tag", tag);
      params.set("sort", "recent");

      const response = await fetch(`/api/community/recipes?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch recipes");
      const data = await response.json();
      setRecipes(data.recipes || []);
    } catch (error) {
      console.error("Error fetching recipes:", error);
    } finally {
      setLoading(false);
    }
  }, [query, tag]);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const handleOpenRecipe = useCallback((id: string) => {
    router.push(`/community/recipes/${id}`);
  }, [router]);

  const handleSaveRecipe = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/community/recipes/${id}/save`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to save recipe");
      alert("Recipe saved to your library!");
    } catch (error) {
      console.error("Error saving recipe:", error);
      alert("Failed to save recipe. Please try again.");
    }
  }, []);

  const handleTagChange = useCallback((tag: string | 'all') => {
    setTag(tag === 'all' ? '' : tag);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CommunityRecipeFeedView
        recipes={recipes}
        searchQuery={query}
        activeTag={tag || 'all'}
        onSearchChange={setQuery}
        onSetTag={handleTagChange}
        onOpenRecipe={handleOpenRecipe}
        onSaveToLibrary={handleSaveRecipe}
      />
    </div>
  );
}

