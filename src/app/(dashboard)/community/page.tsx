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
import { PageLoader } from "@/components/ui/page-loader";
import { cardClassName, IconBadge, rowsClassName, StatusDot, cx } from "@/components/ui/kit";
import { ChevronRight, Download, UserRound } from "lucide-react";

export default function CommunityPage() {
  const router = useRouter();
  const communityData = useQuery(api.community.listRecipes, { limit: 6, sort: "popular" });
  // Local query only; the status card still renders if it has not resolved yet.
  const connection = useQuery(api.community.connection, {});
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
        photoUrl: recipe.photoUrl,
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
      <PageLoader />
    );
  }

  const rowLink =
    "flex min-h-14 items-center gap-3 px-4 py-3 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/40";
  const accountConnected = connection?.connected === true;

  const status = (
    <div className={cx(cardClassName, rowsClassName, "overflow-hidden")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <StatusDot tone={communityData.available ? "success" : "warning"} />
        <p role={communityData.available ? undefined : "status"} className="min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-300">
          {communityData.available
            ? "Community service is online. Shared recipes load from the connected service."
            : "Community sharing is not connected or is temporarily unavailable. Your local recipes are ready to use."}
        </p>
      </div>
      <Link className={rowLink} href="/community/connect" aria-describedby="community-account-hint">
        <IconBadge icon={UserRound} tone={accountConnected ? "success" : "neutral"} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">Connect community account</span>
          <span id="community-account-hint" aria-hidden="true" className="block text-xs text-stone-500 dark:text-stone-400">
            {accountConnected ? "This kitchen can publish recipes." : "Sign in to publish recipes from your library."}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <Link className={rowLink} href="/explore" aria-describedby="community-explore-hint">
        <IconBadge icon={Download} tone="info" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">Public recipe downloads</span>
          <span id="community-explore-hint" aria-hidden="true" className="block text-xs text-stone-500 dark:text-stone-400">Browse without a kitchen account.</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </div>
  );

  return (
    <>
      <CommunityHubView
        featuredRecipes={featuredRecipes}
        status={status}
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
    </>
  );
}
