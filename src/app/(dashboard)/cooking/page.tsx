"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useRouter, useSearchParams } from "next/navigation";
import {
  WhatCanICookView,
  CookRecipeView,
  type Recipe,
  type CookabilityFilter,
  type CookSort,
} from "@/components/cooking";
import { AlertModal } from "@/components/ui/alert-modal";

type ViewMode = "list" | "cook";

export default function CookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const cookingData = useQuery(api.cooking.whatCanICook, {});
  const shoppingListData = useQuery(api.shoppingList.get, {});
  const addMissing = useMutation(api.cooking.addMissingToShoppingList);
  const cookRecipe = useMutation(api.cooking.cookRecipe);

  const recipes = useMemo(
    () => cookingData?.recipes || [],
    [cookingData?.recipes]
  );
  const pantrySnapshot = useMemo(
    () => cookingData?.pantrySnapshot || [],
    [cookingData?.pantrySnapshot]
  );
  const suggestedTags = useMemo(
    () => cookingData?.suggestedTags || [],
    [cookingData?.suggestedTags]
  );

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedRecipeId, setSelectedRecipeId] = useState<Id<"recipes"> | null>(null);
  const [cameFromRecipePage, setCameFromRecipePage] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | "all">("all");
  const [cookability, setCookability] = useState<CookabilityFilter>("all");
  const [sort, setSort] = useState<CookSort>("recent");
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const recipeInList = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId),
    [recipes, selectedRecipeId]
  );

  const externalRecipe = useQuery(
    api.recipes.getById,
    selectedRecipeId && cameFromRecipePage && !recipeInList
      ? { id: selectedRecipeId }
      : "skip"
  );

  const shoppingListCount = useMemo(
    () =>
      (shoppingListData?.items || []).filter(
        (item: { checked?: boolean }) => !item.checked
      ).length,
    [shoppingListData?.items]
  );

  useEffect(() => {
    const recipeId = searchParams.get("recipeId");
    if (recipeId) {
      setSelectedRecipeId(recipeId as Id<"recipes">);
      setCameFromRecipePage(recipeId);
      setViewMode("cook");
      router.replace("/cooking", { scroll: false });
    }
  }, [searchParams, router]);

  const handleCookRecipe = useCallback((recipeId: string) => {
    setSelectedRecipeId(recipeId as Id<"recipes">);
    setCameFromRecipePage(null);
    setViewMode("cook");
  }, []);

  const handleAddMissingToShoppingList = useCallback(
    async (recipeId: string) => {
      try {
        await addMissing({ recipeId: recipeId as Id<"recipes">, items: [] });
        setAlertModal({
          isOpen: true,
          message: "Missing ingredients added to shopping list!",
          variant: "success",
        });
      } catch (error) {
        console.error("Error adding missing ingredients:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to add missing ingredients. Please try again.",
          variant: "error",
        });
      }
    },
    [addMissing]
  );

  const handleConfirmCook = useCallback(
    async (options: { addMissingToList: boolean }) => {
      if (!selectedRecipeId) return;

      try {
        await cookRecipe({
          recipeId: selectedRecipeId,
          addMissingToShoppingList: options.addMissingToList,
        });

        setViewMode("list");
        setSelectedRecipeId(null);
        setCameFromRecipePage(null);
        setAlertModal({
          isOpen: true,
          message:
            "Recipe cooked! Inventory updated and missing items added to shopping list.",
          variant: "success",
        });
      } catch (error) {
        console.error("Error cooking recipe:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to cook recipe. Please try again.",
          variant: "error",
        });
      }
    },
    [cookRecipe, selectedRecipeId]
  );

  const handleBack = useCallback(() => {
    if (cameFromRecipePage) {
      router.push(`/recipes/${cameFromRecipePage}`);
      setCameFromRecipePage(null);
    } else {
      setViewMode("list");
    }

    setSelectedRecipeId(null);
  }, [cameFromRecipePage, router]);

  const handleOpenShoppingList = useCallback(() => {
    router.push("/shopping-list");
  }, [router]);

  const loading = cookingData === undefined || shoppingListData === undefined;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  const selectedRecipe: Recipe | null =
    recipeInList || (externalRecipe as Recipe | undefined) || null;

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
          onClose={() =>
            setAlertModal({ isOpen: false, message: "", variant: "error" })
          }
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
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </>
  );
}
