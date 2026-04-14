"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useRouter, useParams } from "next/navigation";
import { RecipeDetailView } from "@/components/recipes";
import type { Recipe } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";

export default function RecipeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as string;

  const recipe = useQuery(api.recipes.getById, recipeId ? { id: recipeId } : "skip");
  const inventoryData = useQuery(api.inventory.list, {});
  const toggleFavorite = useMutation(api.recipes.toggleFavorite);
  const updateRecipe = useMutation(api.recipes.update);

  const pantrySnapshot = useMemo(
    () => inventoryData?.items || [],
    [inventoryData?.items]
  );

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handleBack = useCallback(() => {
    router.push("/recipes");
  }, [router]);

  const handleCook = useCallback(
    (id: string) => {
      router.push(`/cooking?recipeId=${id}`);
    },
    [router]
  );

  const handleEdit = useCallback(
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

  const handleUploadPhoto = useCallback(
    async (id: string, file: File) => {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const uploadResponse = await fetch("/api/upload/recipe", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || "Failed to upload photo");
        }

        await updateRecipe({ id, photoUrl: uploadData.file.url });
        setAlertModal({
          isOpen: true,
          message: "Recipe photo updated.",
          variant: "success",
        });
      } catch (error) {
        console.error("Error uploading recipe photo:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to upload photo. Please try again.",
          variant: "error",
        });
      }
    },
    [updateRecipe]
  );

  const handleRemovePhoto = useCallback(
    async (id: string) => {
      try {
        await updateRecipe({ id, photoUrl: null });
        setAlertModal({
          isOpen: true,
          message: "Recipe photo removed.",
          variant: "success",
        });
      } catch (error) {
        console.error("Error removing recipe photo:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to remove photo. Please try again.",
          variant: "error",
        });
      }
    },
    [updateRecipe]
  );

  if (recipe === undefined) {
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
    <>
      <RecipeDetailView
        recipe={recipe as Recipe}
        pantrySnapshot={pantrySnapshot}
        onBack={handleBack}
        onCook={handleCook}
        onEdit={handleEdit}
        onToggleFavorite={handleToggleFavorite}
        onUploadPhoto={handleUploadPhoto}
        onRemovePhoto={handleRemovePhoto}
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
