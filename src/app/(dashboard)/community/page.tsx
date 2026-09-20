"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CommunityHubView } from "@/components/community";
import type { CommunityRecipeListing } from "@/components/community/types";
import { AlertModal } from "@/components/ui/alert-modal";

export default function CommunityPage() {
  const router = useRouter();
  const communityData = useQuery(api.community.listRecipes, { limit: 6, sort: "popular" });
  const saveRecipe = useMutation(api.community.saveRecipe);

  const featuredRecipes = useMemo<CommunityRecipeListing[]>(
    () =>
      (communityData?.recipes || []).map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        authorName: recipe.author.name,
        description: recipe.description,
        tags: recipe.tags,
        totalTimeMinutes: recipe.totalTimeMinutes,
        saves: recipe.savedCount || 0,
      })),
    [communityData?.recipes]
  );

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handleOpenRecipe = useCallback(
    (id: string) => {
      router.push(`/community/recipes/${id}`);
    },
    [router]
  );

  const handleSaveRecipe = useCallback(
    async (id: string) => {
      try {
        await saveRecipe({ recipeId: id as Id<"recipes"> });
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

  const handlePublishRecipe = useCallback(() => {
    router.push("/recipes");
  }, [router]);

  if (communityData === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-5 flex flex-wrap gap-4"><Link className="underline" href="/community/connect">Connect community account</Link><Link className="underline" href="/explore">Public recipe downloads</Link></div>
      {!communityData.available && <p role="status" className="mb-5">Community sharing is not connected or is temporarily unavailable. Your local recipes are ready to use.</p>}
      <CommunityHubView
        featuredRecipes={featuredRecipes}
        onOpenRecipe={handleOpenRecipe}
        onSaveRecipe={handleSaveRecipe}
        onViewAllRecipes={() => router.push("/community/recipes")}
        onPublishRecipe={handlePublishRecipe}
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
