import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { computeRecipeCookability, bucketForMissingCount } from "@/lib/cooking";

// GET /api/cooking/what-can-i-cook - Get recipes with cookability matching
export async function GET(request: NextRequest) {
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

    // Get all recipes for the household
    const recipes = await prisma.recipe.findMany({
      where: { householdId },
      include: {
        ingredients: {
          include: {
            foodItem: true,
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Get current inventory as pantry snapshot
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { householdId },
      include: {
        foodItem: true,
      },
    });

    // Transform inventory to pantry snapshot format
    const pantrySnapshot = inventoryItems.map((item) => ({
      id: item.id,
      name: item.foodItem.name,
      quantity: item.quantity,
      unit: item.unit,
    }));

    // Transform recipes and compute cookability
    const transformed = recipes.map((recipe) => {
      const ingredients = recipe.ingredients.map((ing) => ({
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

      const cookability = computeRecipeCookability(ingredients, pantrySnapshot);

      return {
        id: recipe.id,
        title: recipe.title,
        description: recipe.description || undefined,
        tags: recipe.tags.length > 0 ? recipe.tags : undefined,
        servings: recipe.servings || undefined,
        totalTimeMinutes: recipe.totalTimeMinutes || undefined,
        ingredients,
        cookability: {
          missingCount: cookability.missingCount,
          missingLabels: cookability.missingLabels,
          availableCount: cookability.availableCount,
          bucket: bucketForMissingCount(cookability.missingCount),
        },
      };
    });

    // Get all unique tags from recipes
    const allTags = new Set<string>();
    recipes.forEach((recipe) => {
      recipe.tags.forEach((tag) => allTags.add(tag));
    });

    return NextResponse.json({
      recipes: transformed,
      pantrySnapshot,
      suggestedTags: Array.from(allTags),
    });
  } catch (error) {
    console.error("Error fetching cookable recipes:", error);
    return NextResponse.json(
      { error: "Failed to fetch cookable recipes" },
      { status: 500 }
    );
  }
}

