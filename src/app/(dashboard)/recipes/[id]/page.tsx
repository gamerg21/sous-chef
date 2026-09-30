"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { RecipeDetailView } from "@/components/recipes";
import type { Recipe } from "@/components/recipes";
import { AlertModal } from "@/components/ui/alert-modal";
import { PageLoader } from "@/components/ui/page-loader";
import { formatDay, slotLabels, type PlanEntryValues } from "@/components/plan";

export default function RecipeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const recipeId = params.id as Id<"recipes">;

  const recipe = useQuery(api.recipes.getById, recipeId ? { id: recipeId } : "skip");
  const inventoryData = useQuery(api.inventory.list, {});
  const toggleFavorite = useMutation(api.recipes.toggleFavorite);
  const updateRecipe = useMutation(api.recipes.update);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const saveStorageId = useMutation(api.storage.saveStorageId);
  const addToPlan = useMutation(api.mealPlan.add);

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

  const handleCook = useCallback(
    (id: string) => {
      router.push(`/cooking?recipeId=${id}`);
    },
    [router]
  );

  const handleAddToPlan = useCallback(
    async (id: string, values: PlanEntryValues) => {
      try {
        await addToPlan({ recipeId: id as Id<"recipes">, ...values });
        setAlertModal({
          isOpen: true,
          message: `Planned for ${slotLabels[values.slot].toLowerCase()} on ${formatDay(values.date, { weekday: "long", day: "numeric", month: "short" })}. You'll find it under Plan.`,
          variant: "success",
        });
      } catch (error) {
        console.error("Error adding to plan:", error);
        setAlertModal({
          isOpen: true,
          message: error instanceof Error ? error.message : "Couldn't add this recipe to your plan. Please try again.",
          variant: "error",
        });
        throw error;
      }
    },
    [addToPlan]
  );

  const handleEdit = useCallback(
    (id: string) => {
      router.push(`/recipes/${id}/edit`);
    },
    [router]
  );

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      try {
        await toggleFavorite({ id: id as Id<"recipes"> });
      } catch (error) {
        console.error("Error toggling favorite:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to toggle favorite. Please try again.",
          variant: "error",
        });
      }
    },
    [toggleFavorite]
  );

  const handleUploadPhoto = useCallback(
    async (id: string, file: File) => {
      try {
        const postUrl = await generateUploadUrl({});
        const uploadResponse = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error("Failed to upload photo");
        }
        const { storageId } = (await uploadResponse.json()) as {
          storageId: Id<"_storage">;
        };

        // saveStorageId also patches the recipe's photoUrl.
        await saveStorageId({ storageId, recipeId: id as Id<"recipes"> });
        setAlertModal({
          isOpen: true,
          message: "Recipe photo updated.",
          variant: "success",
        });
      } catch (error) {
        console.error("Error uploading recipe photo:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to upload photo. Please try again.",
          variant: "error",
        });
      }
    },
    [generateUploadUrl, saveStorageId]
  );

  const handleRemovePhoto = useCallback(
    async (id: string) => {
      try {
        await updateRecipe({ id: id as Id<"recipes">, photoUrl: null });
        setAlertModal({
          isOpen: true,
          message: "Recipe photo removed.",
          variant: "success",
        });
      } catch (error) {
        console.error("Error removing recipe photo:", error);
        setAlertModal({
          isOpen: true,
          message:
            error instanceof Error
              ? error.message
              : "Failed to remove photo. Please try again.",
          variant: "error",
        });
      }
    },
    [updateRecipe]
  );

  if (recipe === undefined) {
    return (
      <PageLoader />
    );
  }

  if (!recipe) {
    return null;
  }

  return (
    <>
      <RecipeDetailView
        recipe={recipe as Recipe}
        pantrySnapshot={pantrySnapshot}
        onBack={handleBack}
        onCook={handleCook}
        onEdit={handleEdit}
        onPublish={id=>router.push(`/community/publish?recipeId=${encodeURIComponent(id)}`)}
        onAddToPlan={handleAddToPlan}
        onToggleFavorite={handleToggleFavorite}
        onUploadPhoto={handleUploadPhoto}
        onRemovePhoto={handleRemovePhoto}
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
