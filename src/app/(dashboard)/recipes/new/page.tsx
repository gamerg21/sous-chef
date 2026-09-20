"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import { useRouter } from "next/navigation";
import { RecipeEditorView } from "@/components/recipes";
import type { Recipe } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";

import { CaptureRecipeModal } from "@/components/recipes/CaptureRecipeModal";

import { recipeCreatePayload } from "@/lib/recipe-payload";

import { PantryIdeasModal } from "@/components/recipes/PantryIdeasModal";

export default function NewRecipePage() {
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturedRecipe, setCapturedRecipe] = useState<Recipe | undefined>();
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
        const saved = await createRecipe(recipeCreatePayload(recipe));
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
      <div className="flex flex-wrap gap-2 px-4 pt-5 sm:px-6"><button type="button" onClick={() => setCaptureOpen(true)} className="min-h-11 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Paste a recipe</button><button type="button" onClick={() => setIdeasOpen(true)} className="min-h-11 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium dark:border-stone-700">Idea from pantry</button></div>
      {ideasOpen && <PantryIdeasModal onClose={() => setIdeasOpen(false)} onDraft={setCapturedRecipe} />}
      {captureOpen && <CaptureRecipeModal onClose={() => setCaptureOpen(false)} onCapture={recipe => setCapturedRecipe({ ...recipe, id: `captured-${Date.now()}` })} />}
      <RecipeEditorView
        recipe={capturedRecipe}
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
