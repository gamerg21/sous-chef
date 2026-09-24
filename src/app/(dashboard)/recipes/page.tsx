"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useQuery, useMutation, useKitchen } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { useRouter } from "next/navigation";
import { RecipeLibraryView } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { PageLoader } from "@/components/ui/page-loader";

export default function RecipesPage() {
  const router = useRouter();
  const convex = useKitchen();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recipesData = useQuery(api.recipes.list, {});
  const inventoryData = useQuery(api.inventory.list, {});
  const toggleFavorite = useMutation(api.recipes.toggleFavorite);
  const removeRecipe = useMutation(api.recipes.remove);
  const importRecipes = useMutation(api.recipes.importRecipes);

  const recipes = useMemo(
    () => recipesData?.recipes || [],
    [recipesData?.recipes]
  );
  const pantrySnapshot = useMemo(
    () => inventoryData?.items || [],
    [inventoryData?.items]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | "all">("all");
  const [sort, setSort] = useState<
    "recently-updated" | "time-asc" | "title-asc"
  >("recently-updated");
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const [recipeToDelete, setRecipeToDelete] = useState<Id<"recipes"> | null>(null);

  const handleOpenRecipe = useCallback(
    (id: string) => {
      router.push(`/recipes/${id}`);
    },
    [router]
  );

  const handleCreateRecipe = useCallback(() => {
    router.push("/recipes/new");
  }, [router]);

  const handleImportRecipe = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;

      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("Selected file is not valid JSON.");
        }

        const data = await importRecipes({ data: parsed });

        setAlertModal({
          isOpen: true,
          message: `Imported ${data.importedCount || 0} recipe(s).`,
          variant: "success",
        });
      } catch (error) {
        console.error("Error importing recipes:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to import recipes. Please try again.",
          variant: "error",
        });
      }
    },
    [importRecipes]
  );

  const handleExportAll = useCallback(() => {
    (async () => {
      try {
        const data = await convex.query(api.recipes.exportAll, {});
        const blob = new Blob([JSON.stringify(data.recipes, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const fileName = `recipes-${new Date().toISOString().split("T")[0]}.json`;

        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error exporting recipes:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to export recipes. Please try again.",
          variant: "error",
        });
      }
    })();
  }, [convex]);

  const handleEditRecipe = useCallback(
    (id: string) => {
      router.push(`/recipes/${id}/edit`);
    },
    [router]
  );

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      try {
        await toggleFavorite({ id: id as Id<"recipes"> });
      } catch (error) {
        console.error("Error toggling favorite:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to toggle favorite. Please try again.",
          variant: "error",
        });
      }
    },
    [toggleFavorite]
  );

  const handleDeleteRecipe = useCallback((id: string) => {
    setRecipeToDelete(id as Id<"recipes">);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const id = recipeToDelete;
    if (!id) return;

    try {
      await removeRecipe({ id });
      setRecipeToDelete(null);
    } catch (error) {
      console.error("Error deleting recipe:", error);
      setAlertModal({
        isOpen: true,
        message: "Failed to delete recipe. Please try again.",
        variant: "error",
      });
      setRecipeToDelete(null);
    }
  }, [removeRecipe, recipeToDelete]);

  const suggestedTags = useMemo(
    () => Array.from(new Set(recipes.flatMap((recipe) => recipe.tags || []))).sort(),
    [recipes]
  );

  if (recipesData === undefined) {
    return (
      <PageLoader />
    );
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />
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
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
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
