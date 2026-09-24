"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { CommunityRecipeDetailView } from "@/components/community";
import { AlertModal } from "@/components/ui/alert-modal";
import { PageLoader } from "@/components/ui/page-loader";
import { buttonClassName, cardClassName, EmptyState, PageContainer } from "@/components/ui/kit";
import { SearchX } from "lucide-react";

export default function CommunityRecipeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as Id<"recipes">;

  const recipe = useQuery(api.community.getRecipe, id ? { id } : "skip");
  const saveRecipe = useMutation(api.community.saveRecipe);


  const recipeData = useMemo(() => recipe || null, [recipe]);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handleSaveRecipe = useCallback(
    async (recipeId: string) => {
      try {
        await saveRecipe({ recipeId: recipeId as Id<"recipes"> });
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

  if (recipe === undefined) {
    return (
      <PageLoader />
    );
  }

  if (!recipeData) {
    return (
      <PageContainer width="3xl">
        <div className={cardClassName}>
          <EmptyState
            icon={SearchX}
            title="Recipe not found"
            description="It may have been unpublished, or the community service is unavailable."
            action={
              <button type="button" onClick={() => router.push("/community/recipes")} className={buttonClassName("secondary")}>
                Browse community recipes
              </button>
            }
          />
        </div>
      </PageContainer>
    );
  }

  return (
    <>
      <CommunityRecipeDetailView
        recipe={recipeData}
        onSaveToLibrary={handleSaveRecipe}
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
    </>
  );
}
