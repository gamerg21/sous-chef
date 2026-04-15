"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useRouter, useSearchParams } from "next/navigation";
import { PublishRecipeView } from "@/components/community";
import { AlertModal } from "@/components/ui/alert-modal";

export default function PublishRecipePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipeId = (searchParams.get("recipeId") || "") as Id<"recipes">;

  const recipe = useQuery(
    api.recipes.getById,
    recipeId ? { id: recipeId } : "skip"
  );
  const publishRecipe = useMutation(api.community.publishRecipe);

  const recipeData = useMemo(() => recipe || null, [recipe]);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handlePublish = useCallback(
    async (data: {
      title: string;
      description?: string;
      tags: string[];
      visibility: "public" | "unlisted";
    }) => {
      if (!recipeId) {
        setAlertModal({ isOpen: true, message: "No recipe selected", variant: "warning" });
        return;
      }

      try {
        await publishRecipe({ recipeId });

        setAlertModal({
          isOpen: true,
          message: "Recipe published successfully!",
          variant: "success",
        });
        setTimeout(() => router.push("/community"), 1000);
      } catch (error) {
        console.error("Error publishing recipe:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to publish recipe. Please try again.",
          variant: "error",
        });
      }
    },
    [publishRecipe, recipeId, router]
  );

  if (!recipeId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-stone-600 dark:text-stone-400 mb-4">No recipe selected</p>
          <button
            onClick={() => router.push("/recipes")}
            className="text-emerald-600 hover:text-emerald-700"
          >
            Go to Recipes
          </button>
        </div>
      </div>
    );
  }

  if (recipe === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  if (!recipeData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-stone-600 dark:text-stone-400 mb-4">Recipe not found</p>
          <button
            onClick={() => router.push("/recipes")}
            className="text-emerald-600 hover:text-emerald-700"
          >
            Go to Recipes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <PublishRecipeView
        draft={{
          title: recipeData.title,
          description: recipeData.description,
          tags: recipeData.tags || [],
          visibility: "public",
        }}
        onPublish={handlePublish}
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
