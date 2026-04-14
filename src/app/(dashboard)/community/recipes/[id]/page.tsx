"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { useRouter, useParams } from "next/navigation";
import { CommunityRecipeDetailView } from "@/components/community";
import { AlertModal } from "@/components/ui/alert-modal";

export default function CommunityRecipeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const recipe = useQuery(api.community.getRecipe, id ? { id } : "skip");
  const saveRecipe = useMutation(api.community.saveRecipe);
  const likeRecipe = useMutation(api.community.likeRecipe);

  const recipeData = useMemo(() => recipe || null, [recipe]);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handleSaveRecipe = useCallback(
    async (recipeId: string) => {
      try {
        await saveRecipe({ id: recipeId });
        setAlertModal({
          isOpen: true,
          message: "Recipe saved to your library!",
          variant: "success",
        });
      } catch (error) {
        console.error("Error saving recipe:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to save recipe. Please try again.",
          variant: "error",
        });
      }
    },
    [saveRecipe]
  );

  const handleLike = useCallback(
    async (recipeId: string) => {
      try {
        await likeRecipe({ id: recipeId });
      } catch (error) {
        console.error("Error toggling like:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to toggle like. Please try again.",
          variant: "error",
        });
      }
    },
    [likeRecipe]
  );

  if (recipe === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  if (!recipeData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Recipe not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CommunityRecipeDetailView
        recipe={recipeData}
        onSaveToLibrary={handleSaveRecipe}
        onLike={handleLike}
        onBack={() => router.back()}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
}
