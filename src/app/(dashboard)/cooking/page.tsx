"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  WhatCanICookView,
  CookRecipeView,
  type Recipe,
  type PantrySnapshotItem,
  type CookabilityFilter,
  type CookSort,
} from "@/components/cooking";
import { AlertModal } from "@/components/ui/alert-modal";

type ViewMode = "list" | "cook";

export default function CookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [cameFromRecipePage, setCameFromRecipePage] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pantrySnapshot, setPantrySnapshot] = useState<PantrySnapshotItem[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [shoppingListCount, setShoppingListCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [externalRecipe, setExternalRecipe] = useState<Recipe | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | "all">("all");
  const [cookability, setCookability] = useState<CookabilityFilter>("all");
  const [sort, setSort] = useState<CookSort>("recent");
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });

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
      setShoppingListCount((shoppingData.items || []).filter((i: { checked?: boolean }) => !i.checked).length);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Check for recipeId query parameter to automatically show cook view
  useEffect(() => {
    const recipeId = searchParams.get("recipeId");
    if (recipeId) {
      setSelectedRecipeId(recipeId);
      setCameFromRecipePage(recipeId);
      setViewMode("cook");
      // Clean up URL by removing query parameter
      router.replace("/cooking", { scroll: false });
    }
  }, [searchParams, router]);

  // Fetch external recipe if it's not in the recipes list
  useEffect(() => {
    if (!selectedRecipeId || !cameFromRecipePage || loading) return;
    
    const recipeInList = recipes.find((r) => r.id === selectedRecipeId);
    if (!recipeInList && !externalRecipe) {
      const fetchRecipe = async () => {
        try {
          const response = await fetch(`/api/recipes/${selectedRecipeId}`);
          if (response.ok) {
            const recipe = await response.json();
            setExternalRecipe(recipe);
          }
        } catch (error) {
          console.error("Error fetching recipe:", error);
        }
      };
      fetchRecipe();
    }
  }, [selectedRecipeId, cameFromRecipePage, loading, recipes, externalRecipe]);

  const handleCookRecipe = useCallback((recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setCameFromRecipePage(null); // Clear this when cooking from the cooking page itself
    setExternalRecipe(null); // Clear external recipe when cooking from the list
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
      setAlertModal({ isOpen: true, message: "Missing ingredients added to shopping list!", variant: 'success' });
    } catch (error) {
      console.error("Error adding missing ingredients:", error);
      setAlertModal({ isOpen: true, message: "Failed to add missing ingredients. Please try again.", variant: 'error' });
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
      setCameFromRecipePage(null);
      setExternalRecipe(null);
      setAlertModal({ isOpen: true, message: "Recipe cooked! Inventory updated and missing items added to shopping list.", variant: 'success' });
    } catch (error) {
      console.error("Error cooking recipe:", error);
      setAlertModal({ isOpen: true, message: "Failed to cook recipe. Please try again.", variant: 'error' });
    }
  }, [selectedRecipeId, fetchData]);

  const handleBack = useCallback(() => {
    // If we came from recipes page, go back to that recipe
    if (cameFromRecipePage) {
      router.push(`/recipes/${cameFromRecipePage}`);
      setCameFromRecipePage(null);
    } else {
      setViewMode("list");
    }
    setSelectedRecipeId(null);
    setExternalRecipe(null);
  }, [cameFromRecipePage, router]);

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
    ? recipes.find((r) => r.id === selectedRecipeId) || externalRecipe
    : null;

  if (viewMode === "cook" && selectedRecipe) {
    return (
      <>
        <CookRecipeView
          recipe={selectedRecipe}
          pantrySnapshot={pantrySnapshot}
          onBack={handleBack}
          onConfirmCook={handleConfirmCook}
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

  return (
    <>
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
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </>
  );
}
