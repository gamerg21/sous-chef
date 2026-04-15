"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { RecipeEditorView } from "@/components/recipes";
import type { Recipe } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";

export default function EditRecipePage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as Id<"recipes">;

  const recipe = useQuery(api.recipes.getById, recipeId ? { id: recipeId } : "skip");
  const inventoryData = useQuery(api.inventory.list, {});
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
    router.push(`/recipes/${recipeId}`);
  }, [router, recipeId]);

  const handleCancel = useCallback(() => {
    router.push(`/recipes/${recipeId}`);
  }, [router, recipeId]);

  const handleSave = useCallback(
    async (updatedRecipe: Recipe) => {
      try {
        await updateRecipe({ ...updatedRecipe, id: recipeId });
        router.push(`/recipes/${recipeId}`);
      } catch (error) {
        console.error("Error updating recipe:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to update recipe. Please try again.",
          variant: "error",
        });
      }
    },
    [recipeId, router, updateRecipe]
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
      <RecipeEditorView
        recipe={recipe}
        pantrySnapshot={pantrySnapshot}
        onBack={handleBack}
        onCancel={handleCancel}
        onSave={handleSave}
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
