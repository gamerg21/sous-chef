import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const addMissingSchema = z.object({
  recipeId: z.string().min(1, "Recipe ID is required"),
});

// POST /api/cooking/add-missing-to-shopping-list - Add missing ingredients to shopping list
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = addMissingSchema.parse(body);

    // Get the recipe with ingredients
    const recipe = await prisma.recipe.findUnique({
      where: { id: validated.recipeId },
      include: {
        ingredients: {
          include: {
            foodItem: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!recipe || recipe.householdId !== householdId) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // Get current inventory
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { householdId },
      include: {
        foodItem: true,
      },
    });

    // pantrySnapshot is computed but not currently used (kept for future use with computeRecipeCookability)
    const pantrySnapshot = inventoryItems.map((item: { id: string; foodItem: { name: string }; quantity: number; unit: string }) => ({
      id: item.id,
      name: item.foodItem.name,
      quantity: item.quantity,
      unit: item.unit,
    }));
    void pantrySnapshot; // Mark as intentionally unused

    // Transform ingredients
    const ingredients = recipe.ingredients.map((ing: { id: string; name: string; quantity: number | null; unit: string | null; note: string | null; foodItem: { name: string } | null }) => ({
      id: ing.id,
      name: ing.name,
      quantity: ing.quantity || undefined,
      unit: ing.unit || undefined,
      note: ing.note || undefined,
      mapping: ing.note && ing.note.startsWith("MAPPING:")
        ? {
            inventoryItemLabel: ing.note.replace("MAPPING:", "").trim(),
            suggested: false,
          }
        : ing.foodItem
        ? {
            inventoryItemLabel: ing.foodItem.name,
            suggested: false,
          }
        : undefined,
    }));

    // Compute cookability to find missing ingredients (result not currently used)
    // const cookability = computeRecipeCookability(ingredients, pantrySnapshot);

    // Normalize label helper
    function normalizeLabel(s: string): string {
      return (s || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s-]/g, '');
    }

    // Create a map of inventory by normalized name
    const inventoryMap = new Map<string, { id: string; foodItem: { id: string; name: string; createdAt: Date; updatedAt: Date; canonicalName: string | null }; quantity: number; unit: string }>();
    inventoryItems.forEach((item: { id: string; foodItem: { id: string; name: string; createdAt: Date; updatedAt: Date; canonicalName: string | null }; quantity: number; unit: string }) => {
      const key = normalizeLabel(item.foodItem.name);
      if (!inventoryMap.has(key)) {
        inventoryMap.set(key, item);
      }
    });

    // Get missing ingredients
    const missingIngredients: Array<{
      name: string;
      quantity?: number;
      unit?: string;
    }> = [];

    for (const ing of ingredients) {
      const label = ing.mapping?.inventoryItemLabel || ing.name;
      const key = normalizeLabel(label);
      const inventoryItem = inventoryMap.get(key);

      // Skip optional ingredients
      const optional = Boolean(ing.note && /optional|to taste/i.test(ing.note));
      if (optional) continue;

      if (!inventoryItem) {
        // Not in inventory - add to shopping list
        missingIngredients.push({
          name: label,
          quantity: ing.quantity,
          unit: ing.unit,
        });
      }
    }

    // Get or create shopping list
    let shoppingList = await prisma.shoppingList.findUnique({
      where: { householdId },
    });

    if (!shoppingList) {
      shoppingList = await prisma.shoppingList.create({
        data: { householdId },
      });
    }

    // Add missing ingredients to shopping list
    const addedItems = [];
    for (const missing of missingIngredients) {
      // Find or create FoodItem
      let foodItem = await prisma.foodItem.findFirst({
        where: { name: { equals: missing.name, mode: "insensitive" } },
      });

      if (!foodItem) {
        foodItem = await prisma.foodItem.create({
          data: { name: missing.name },
        });
      }

      // Check if item already exists in shopping list
      const existing = await prisma.shoppingListItem.findFirst({
        where: {
          shoppingListId: shoppingList.id,
          foodItemId: foodItem.id,
          checked: false,
        },
      });

      if (!existing) {
        // Create shopping list item
        const item = await prisma.shoppingListItem.create({
          data: {
            shoppingListId: shoppingList.id,
            foodItemId: foodItem.id,
            name: missing.name,
            quantity: missing.quantity || null,
            unit: missing.unit || null,
            source: "from-recipe",
            recipeId: recipe.id,
          },
        });
        addedItems.push(item);
      }
    }

    return NextResponse.json({
      success: true,
      added: addedItems.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error adding missing ingredients to shopping list:", error);
    return NextResponse.json(
      { error: "Failed to add missing ingredients" },
      { status: 500 }
    );
  }
}


