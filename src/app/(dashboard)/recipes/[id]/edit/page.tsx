"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { RecipeEditorView } from "@/components/recipes";
import type { Recipe } from "@/components/recipes";
import { useRecipePantryActions } from "@/components/recipes/useRecipePantryActions";
import { AlertModal } from "@/components/ui/alert-modal";

import { recipeUpdatePayload } from "@/lib/recipe-payload";
import { PageLoader } from "@/components/ui/page-loader";

export default function EditRecipePage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as Id<"recipes">;

  const recipe = useQuery(api.recipes.getById, recipeId ? { id: recipeId } : "skip");
  const inventoryData = useQuery(api.inventory.list, {});
  const pantryActions = useRecipePantryActions();
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
        await updateRecipe({ ...recipeUpdatePayload(updatedRecipe), id: recipeId });
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
      <PageLoader />
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
        {...pantryActions}
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
