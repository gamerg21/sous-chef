"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  WhatCanICookView,
  CookRecipeView,
  type Recipe,
  type PantrySnapshotItem,
  type CookabilityFilter,
  type CookSort,
} from "@/components/cooking";

type ViewMode = "list" | "cook";

export default function CookingPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pantrySnapshot, setPantrySnapshot] = useState<PantrySnapshotItem[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [shoppingListCount, setShoppingListCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | "all">("all");
  const [cookability, setCookability] = useState<CookabilityFilter>("all");
  const [sort, setSort] = useState<CookSort>("recent");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [cookingResponse, shoppingResponse] = await Promise.all([
        fetch("/api/cooking/what-can-i-cook"),
        fetch("/api/shopping-list"),
      ]);

      if (!cookingResponse.ok) throw new Error("Failed to fetch cooking data");
      if (!shoppingResponse.ok) throw new Error("Failed to fetch shopping list");

      const cookingData = await cookingResponse.json();
      const shoppingData = await shoppingResponse.json();

      setRecipes(cookingData.recipes || []);
      setPantrySnapshot(cookingData.pantrySnapshot || []);
      setSuggestedTags(cookingData.suggestedTags || []);
      setShoppingListCount((shoppingData.items || []).filter((i: any) => !i.checked).length);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCookRecipe = useCallback((recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setViewMode("cook");
  }, []);

  const handleAddMissingToShoppingList = useCallback(async (recipeId: string) => {
    try {
      const response = await fetch("/api/cooking/add-missing-to-shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });

      if (!response.ok) throw new Error("Failed to add missing ingredients");
      
      await fetchData();
      alert("Missing ingredients added to shopping list!");
    } catch (error) {
      console.error("Error adding missing ingredients:", error);
      alert("Failed to add missing ingredients. Please try again.");
    }
  }, [fetchData]);

  const handleConfirmCook = useCallback(async (options: { addMissingToList: boolean }) => {
    if (!selectedRecipeId) return;

    try {
      const response = await fetch("/api/cooking/cook-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          recipeId: selectedRecipeId,
          addMissingToList: options.addMissingToList,
        }),
      });

      if (!response.ok) throw new Error("Failed to cook recipe");

      await fetchData();
      setViewMode("list");
      setSelectedRecipeId(null);
      alert("Recipe cooked! Inventory updated and missing items added to shopping list.");
    } catch (error) {
      console.error("Error cooking recipe:", error);
      alert("Failed to cook recipe. Please try again.");
    }
  }, [selectedRecipeId, fetchData]);

  const handleBack = useCallback(() => {
    setViewMode("list");
    setSelectedRecipeId(null);
  }, []);

  const handleOpenShoppingList = useCallback(() => {
    router.push("/shopping-list");
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  const selectedRecipe = selectedRecipeId
    ? recipes.find((r) => r.id === selectedRecipeId)
    : null;

  if (viewMode === "cook" && selectedRecipe) {
    return (
      <CookRecipeView
        recipe={selectedRecipe}
        pantrySnapshot={pantrySnapshot}
        onBack={handleBack}
        onConfirmCook={handleConfirmCook}
      />
    );
  }

  return (
    <WhatCanICookView
      recipes={recipes}
      pantrySnapshot={pantrySnapshot}
      suggestedTags={suggestedTags}
      shoppingListCount={shoppingListCount}
      searchQuery={searchQuery}
      activeTag={activeTag}
      cookability={cookability}
      sort={sort}
      onSearchChange={setSearchQuery}
      onSetTag={setActiveTag}
      onSetCookability={setCookability}
      onSetSort={setSort}
      onOpenShoppingList={handleOpenShoppingList}
      onCookRecipe={handleCookRecipe}
      onAddMissingToShoppingList={handleAddMissingToShoppingList}
    />
  );
}
