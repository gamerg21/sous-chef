import { describe, expect, test } from "vitest";
import { computeRecipeNutrition, readNutrition, toGrams } from "../src/lib/nutrition";

describe("nutrition", () => {
  test("reads Open Food Facts nutriments and hand-entered facts", () => {
    expect(readNutrition({ "energy-kcal_100g": 112, proteins_100g: "1.2", fat_100g: 0.1 })).toEqual({ energyKcal: 112, proteinG: 1.2, fatG: 0.1 });
    expect(readNutrition({ energyKcal: 360, carbsG: 80 })).toEqual({ energyKcal: 360, carbsG: 80 });
    expect(readNutrition({ unrelated: 1 })).toBeUndefined();
  });

  test("converts weights exactly and volumes approximately", () => {
    expect(toGrams(2, "lb")?.grams).toBeCloseTo(907.184);
    expect(toGrams(1, "cup")).toMatchObject({ approximate: true });
    expect(toGrams(3, "clove")).toBeNull();
  });

  test("sums linked ingredients per serving and explains what it skipped", () => {
    const result = computeRecipeNutrition(
      [
        { name: "Rice", quantity: 200, unit: "g", mapping: { inventoryItemLabel: "Basmati Rice" } },
        { name: "Ketchup", quantity: 50, unit: "g", mapping: { inventoryItemLabel: "Ketchup" } },
        { name: "Garlic", quantity: 2, unit: "clove", mapping: { inventoryItemLabel: "Garlic" } },
        { name: "Salt" },
      ],
      [
        { name: "Basmati Rice", nutritionPer100g: { energyKcal: 350, carbsG: 78 } },
        { name: "Ketchup", foodFacts: { nutritionPer100g: { "energy-kcal_100g": 100 } } },
        { name: "Garlic", nutritionPer100g: { energyKcal: 149 } },
      ],
      2,
    );
    expect(result.total.energyKcal).toBeCloseTo(750);
    expect(result.perServing.energyKcal).toBeCloseTo(375);
    expect(result.perServing.carbsG).toBeCloseTo(78);
    expect(result.counted).toEqual(["Rice", "Ketchup"]);
    expect(result.missing).toEqual([
      { name: "Garlic", reason: "no-weight", pantryName: "Garlic" },
      { name: "Salt", reason: "not-linked" },
    ]);
    expect(result.approximate).toBe(false);
  });
});
