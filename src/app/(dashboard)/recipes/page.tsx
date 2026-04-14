"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { RecipeLibraryView } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function RecipesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recipesData = useQuery(api.recipes.list, {});
  const inventoryData = useQuery(api.inventory.list, {});
  const toggleFavorite = useMutation(api.recipes.toggleFavorite);
  const removeRecipe = useMutation(api.recipes.remove);

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
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null);

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

        const data = await fetchJSON<{ importedCount?: number }>(
          "/api/recipes/import",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed),
          }
        );

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
    []
  );

  const handleExportAll = useCallback(() => {
    (async () => {
      try {
        const response = await fetch("/api/recipes/export");
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.error || "Failed to export recipes");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const contentDisposition = response.headers.get("content-disposition");
        const fileNameMatch = contentDisposition?.match(/filename="([^"]+)"/);
        const fileName =
          fileNameMatch?.[1] ||
          `recipes-${new Date().toISOString().split("T")[0]}.json`;

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
  }, []);

  const handleEditRecipe = useCallback(
    (id: string) => {
      router.push(`/recipes/${id}/edit`);
    },
    [router]
  );

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      try {
        await toggleFavorite({ id });
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
    setRecipeToDelete(id);
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
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
