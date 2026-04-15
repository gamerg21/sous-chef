"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { RecipeEditorView } from "@/components/recipes";
import type { Recipe } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";

export default function NewRecipePage() {
  const router = useRouter();
  const inventoryData = useQuery(api.inventory.list, {});
  const createRecipe = useMutation(api.recipes.create);

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

  const handleCancel = useCallback(() => {
    router.push("/recipes");
  }, [router]);

  const handleSave = useCallback(
    async (recipe: Recipe) => {
      try {
        const saved = await createRecipe(recipe);
        router.push(`/recipes/${saved}`);
      } catch (error) {
        console.error("Error saving recipe:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to save recipe. Please try again.",
          variant: "error",
        });
      }
    },
    [createRecipe, router]
  );

  return (
    <>
      <RecipeEditorView
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
