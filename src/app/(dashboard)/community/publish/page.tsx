"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PublishRecipeView } from "@/components/community";
import { AlertModal } from "@/components/ui/alert-modal";
import { PageLoader } from "@/components/ui/page-loader";
import { buttonClassName, cardClassName, cx, EmptyState, PageContainer, rowsClassName, StatusDot } from "@/components/ui/kit";
import { Share2 } from "lucide-react";

export default function PublishRecipePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recipeId = (searchParams.get("recipeId") || "") as Id<"recipes">;

  const connection = useQuery(api.community.connection, {});
  const recipe = useQuery(
    api.recipes.getById,
    recipeId ? { id: recipeId } : "skip"
  );
  const updateRecipe = useMutation(api.recipes.update);
  const publishRecipe = useMutation(api.community.publishRecipe);
  const unpublishRecipe = useMutation(api.community.unpublishRecipe);

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
        await updateRecipe({id:recipeId,title:data.title,description:data.description,tags:data.tags});
        await publishRecipe({ recipeId, visibility: data.visibility });

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
          message: error instanceof Error ? error.message : "Failed to publish recipe. Please try again.",
          variant: "error",
        });
      }
    },
    [publishRecipe, updateRecipe, recipeId, router]
  );

  const isPublished =
    recipeData?.publicationVisibility === "public" || recipeData?.publicationVisibility === "unlisted";

  const handleUnpublish = useCallback(async () => {
    if (!recipeId) return;
    try {
      await unpublishRecipe({ recipeId });
      setAlertModal({
        isOpen: true,
        message: "Recipe is now private.",
        variant: "success",
      });
    } catch (error) {
      console.error("Error unpublishing recipe:", error);
      setAlertModal({
        isOpen: true,
        message: "Failed to unpublish recipe. Please try again.",
        variant: "error",
      });
    }
  }, [unpublishRecipe, recipeId]);

  if (!recipeId) {
    return (
      <PageContainer width="3xl">
        <div className={cardClassName}>
          <EmptyState
            icon={Share2}
            title="No recipe selected"
            description="Open a recipe in your library and choose Share to publish it."
            action={
              <button type="button" onClick={() => router.push("/recipes")} className={buttonClassName("primary")}>
                Go to Recipes
              </button>
            }
          />
        </div>
      </PageContainer>
    );
  }

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
            icon={Share2}
            title="Recipe not found"
            description="It may have been deleted from your library."
            action={
              <button type="button" onClick={() => router.push("/recipes")} className={buttonClassName("primary")}>
                Go to Recipes
              </button>
            }
          />
        </div>
      </PageContainer>
    );
  }

  const notice = (!connection?.connected || isPublished) && (
    <div className={cx(cardClassName, rowsClassName, "overflow-hidden")}>
      {!connection?.connected && (
        <div className="flex items-center gap-3 px-4 py-3">
          <StatusDot tone="warning" />
          <p className="min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-300">
            To publish, <Link href="/community/connect" className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400">connect your community account</Link>.
          </p>
        </div>
      )}
      {isPublished && (
        <div className="flex flex-wrap items-center gap-3 bg-emerald-50/60 px-4 py-3 dark:bg-emerald-950/20">
          <StatusDot tone="success" />
          <p className="min-w-0 flex-1 text-sm text-emerald-900 dark:text-emerald-200">
            This recipe is currently shared with the connected recipe community
            {recipeData?.publicationVisibility === "unlisted" ? " (unlisted)" : ""}.
          </p>
          <button type="button" onClick={handleUnpublish} className={buttonClassName("secondary", "sm")}>
            Unpublish
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <PublishRecipeView
        draft={{
          title: recipeData.title,
          description: recipeData.description,
          tags: recipeData.tags || [],
          photoUrl: recipeData.photoUrl ?? undefined,
          visibility: "public",
        }}
        notice={notice}
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
    </>
  );
}
