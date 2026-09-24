"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import { useRouter } from "next/navigation";
import { RecipeEditorView } from "@/components/recipes";
import type { Recipe } from "@/components/recipes";
import { useRecipePantryActions } from "@/components/recipes/useRecipePantryActions";
import { AlertModal } from "@/components/ui/alert-modal";
import { buttonClassName, cx, eyebrowClassName } from "@/components/ui/kit";
import { Link2, Sparkles } from "lucide-react";

import { CaptureRecipeModal } from "@/components/recipes/CaptureRecipeModal";

import { recipeCreatePayload } from "@/lib/recipe-payload";

import { PantryIdeasModal } from "@/components/recipes/PantryIdeasModal";

export default function NewRecipePage() {
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturedRecipe, setCapturedRecipe] = useState<Recipe | undefined>();
  const router = useRouter();
  const inventoryData = useQuery(api.inventory.list, {});
  const pantryActions = useRecipePantryActions();
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
      <div className="px-4 pt-5 sm:px-6 sm:pt-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <span className={cx(eyebrowClassName, "mr-1")}>Start from</span>
          <button type="button" onClick={() => setCaptureOpen(true)} className={buttonClassName("soft")}>
            <Link2 className="h-4 w-4" strokeWidth={1.75} />
            Import a recipe
          </button>
          <button type="button" onClick={() => setIdeasOpen(true)} className={buttonClassName("secondary")}>
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            Idea from pantry
          </button>
        </div>
      </div>
      {ideasOpen && <PantryIdeasModal onClose={() => setIdeasOpen(false)} onDraft={setCapturedRecipe} />}
      {captureOpen && <CaptureRecipeModal onClose={() => setCaptureOpen(false)} onCapture={recipe => setCapturedRecipe({ ...recipe, id: `captured-${Date.now()}` })} />}
      <RecipeEditorView
        recipe={capturedRecipe}
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
