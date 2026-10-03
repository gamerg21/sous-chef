"use client";

import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { MealPlanView, addDays, startOfWeek, type PlannedMeal } from "@/components/plan";
import { AlertModal } from "@/components/ui/alert-modal";
import { PageLoader } from "@/components/ui/page-loader";

export default function PlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("week");
  const weekStart = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? startOfWeek(new Date(`${requested}T12:00:00`)) : startOfWeek();

  const week = useQuery(api.mealPlan.week, { from: weekStart });
  const shortages = useQuery(api.mealPlan.weekShortages, { from: weekStart });
  const addMeal = useMutation(api.mealPlan.add);
  const updateMeal = useMutation(api.mealPlan.update);
  const removeMeal = useMutation(api.mealPlan.remove);
  const addShortages = useMutation(api.mealPlan.addWeekShortagesToShoppingList);
  const [addingShortages, setAddingShortages] = useState(false);
  const [alert, setAlert] = useState<{ message: string; variant: "success" | "error" | "info" } | null>(null);

  const fail = useCallback((message: string) => (error: unknown) => {
    console.error(message, error);
    setAlert({ message: error instanceof Error && error.message ? error.message : message, variant: "error" });
  }, []);

  const changeWeek = useCallback((direction: -1 | 0 | 1) => {
    const next = direction === 0 ? startOfWeek() : addDays(weekStart, direction * 7);
    router.replace(next === startOfWeek() ? "/plan" : `/plan?week=${next}`, { scroll: false });
  }, [router, weekStart]);

  const handleAddShortages = useCallback(async () => {
    setAddingShortages(true);
    try {
      const result = await addShortages({ from: weekStart });
      const changed = result.added + result.updated;
      setAlert({
        variant: "success",
        message: changed
          ? `Shopping list updated: ${result.added} added, ${result.updated} topped up.${result.manualChecks ? " Some ingredients still need a manual amount or unit check." : ""}`
          : "Your shopping list already covers this week's shortages.",
      });
    } catch (error) {
      fail("Couldn't add this week's shortages. Please try again.")(error);
    } finally {
      setAddingShortages(false);
    }
  }, [addShortages, weekStart, fail]);

  const handleCook = useCallback((meal: PlannedMeal) => {
    const back = weekStart === startOfWeek() ? "" : `&week=${weekStart}`;
    router.push(`/cooking?recipeId=${meal.recipeId}&planEntryId=${meal.id}${back}`);
  }, [router, weekStart]);

  if (week === undefined) return <PageLoader />;

  return (
    <>
      <MealPlanView
        weekStart={weekStart}
        entries={week.entries as PlannedMeal[]}
        recipes={week.recipes}
        shortages={shortages}
        addingShortages={addingShortages}
        onChangeWeek={changeWeek}
        onAddMeal={async ({ recipeId, ...values }) => {
          await addMeal({ ...values, recipeId: recipeId as Id<"recipes"> }).catch(fail("Couldn't plan that meal. Please try again."));
        }}
        onUpdateMeal={async (id, patch) => {
          await updateMeal({ id: id as Id<"mealPlanEntries">, ...patch }).catch(fail("Couldn't update that meal. Please try again."));
        }}
        onRemoveMeal={async (id) => {
          await removeMeal({ id: id as Id<"mealPlanEntries"> }).catch(fail("Couldn't remove that meal. Please try again."));
        }}
        onCookMeal={handleCook}
        onOpenRecipe={(recipeId) => router.push(`/recipes/${recipeId}`)}
        onAddShortages={() => void handleAddShortages()}
      />
      <AlertModal isOpen={alert !== null} onClose={() => setAlert(null)} message={alert?.message ?? ""} variant={alert?.variant} />
    </>
  );
}
