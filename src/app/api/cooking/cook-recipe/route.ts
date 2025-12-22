import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { computeRecipeCookability } from "@/lib/cooking";

const cookRecipeSchema = z.object({
  recipeId: z.string().min(1, "Recipe ID is required"),
  addMissingToList: z.boolean().default(true),
});

// POST /api/cooking/cook-recipe - Cook a recipe (deduct inventory, add missing to shopping list)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = cookRecipeSchema.parse(body);

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

    const pantrySnapshot = inventoryItems.map((item: { id: string; foodItem: { name: string }; quantity: number; unit: string }) => ({
      id: item.id,
      name: item.foodItem.name,
      quantity: item.quantity,
      unit: item.unit,
    }));

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

    // Compute cookability to find missing ingredients
    const cookability = computeRecipeCookability(ingredients, pantrySnapshot);

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

    // Process each ingredient: deduct from inventory or add to shopping list
    const inventoryUpdates: Array<{ id: string; newQuantity: number }> = [];
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

      if (inventoryItem && ing.quantity && ing.unit) {
        // Try to deduct from inventory
        // For now, we'll do a simple quantity match - in a real app, you'd need unit conversion
        if (inventoryItem.unit === ing.unit && inventoryItem.quantity >= ing.quantity) {
          const newQuantity = inventoryItem.quantity - ing.quantity;
          inventoryUpdates.push({ id: inventoryItem.id, newQuantity });
        } else {
          // Can't deduct (unit mismatch or insufficient quantity) - add to shopping list
          missingIngredients.push({
            name: label,
            quantity: ing.quantity,
            unit: ing.unit,
          });
        }
      } else if (!inventoryItem) {
        // Not in inventory - add to shopping list
        missingIngredients.push({
          name: label,
          quantity: ing.quantity,
          unit: ing.unit,
        });
      }
    }

    // Update inventory in a transaction
    await prisma.$transaction(async (tx: any) => {
      // Update inventory items
      for (const update of inventoryUpdates) {
        await tx.inventoryItem.update({
          where: { id: update.id },
          data: { quantity: update.newQuantity },
        });
      }

      // Get or create shopping list
      let shoppingList = await tx.shoppingList.findUnique({
        where: { householdId },
      });

      if (!shoppingList) {
        shoppingList = await tx.shoppingList.create({
          data: { householdId },
        });
      }

      // Add missing ingredients to shopping list (if requested)
      if (validated.addMissingToList && missingIngredients.length > 0) {
        for (const missing of missingIngredients) {
          // Find or create FoodItem
          let foodItem = await tx.foodItem.findFirst({
            where: { name: { equals: missing.name, mode: "insensitive" } },
          });

          if (!foodItem) {
            foodItem = await tx.foodItem.create({
              data: { name: missing.name },
            });
          }

          // Create shopping list item
          await tx.shoppingListItem.create({
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
        }
      }

      // Update recipe lastCookedAt
      await tx.recipe.update({
        where: { id: recipe.id },
        data: { lastCookedAt: new Date() },
      });
    });

    return NextResponse.json({
      success: true,
      inventoryUpdated: inventoryUpdates.length,
      missingAdded: missingIngredients.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error cooking recipe:", error);
    return NextResponse.json(
      { error: "Failed to cook recipe" },
      { status: 500 }
    );
  }
}

