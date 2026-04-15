"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useRouter, useSearchParams } from "next/navigation";
import { CommunityRecipeFeedView } from "@/components/community";
import type { CommunityRecipe } from "@/components/community/types";
import { AlertModal } from "@/components/ui/alert-modal";

export default function CommunityRecipesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [tag, setTag] = useState(searchParams.get("tag") || "");
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const recipesData = useQuery(api.community.listRecipes, {
    search: query || undefined,
    tag: tag || undefined,
    sort: "recent",
  });
  const saveRecipe = useMutation(api.community.saveRecipe);

  const recipes = useMemo<CommunityRecipe[]>(
    () => recipesData?.recipes || [],
    [recipesData?.recipes]
  );

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

  const handleTagChange = useCallback((nextTag: string | "all") => {
    setTag(nextTag === "all" ? "" : nextTag);
  }, []);

  if (recipesData === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CommunityRecipeFeedView
        recipes={recipes}
        searchQuery={query}
        activeTag={tag || "all"}
        onSearchChange={setQuery}
        onSetTag={handleTagChange}
        onOpenRecipe={handleOpenRecipe}
        onSaveToLibrary={handleSaveRecipe}
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
