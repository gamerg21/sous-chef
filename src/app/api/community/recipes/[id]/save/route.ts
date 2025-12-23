import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// POST /api/community/recipes/[id]/save - Save community recipe to private library
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    // Get the community recipe
    const communityRecipe = await prisma.recipe.findFirst({
      where: {
        id,
        visibility: {
          in: ["public", "unlisted"],
        },
      },
      include: {
        ingredients: {
          orderBy: { order: "asc" },
        },
        steps: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!communityRecipe) {
      return NextResponse.json(
        { error: "Community recipe not found" },
        { status: 404 }
      );
    }

    // Check if user already saved this recipe
    const existingSave = await prisma.communityRecipeSave.findFirst({
      where: {
        recipeId: id,
        userId,
      },
    });

    if (existingSave) {
      return NextResponse.json(
        { error: "Recipe already saved" },
        { status: 400 }
      );
    }

    // Create save record
    await prisma.communityRecipeSave.create({
      data: {
        recipeId: id,
        userId,
      },
    });

    // Copy recipe to user's household library
    const copiedRecipe = await prisma.recipe.create({
      data: {
        householdId,
        title: communityRecipe.title,
        description: communityRecipe.description,
        photoUrl: communityRecipe.photoUrl,
        tags: communityRecipe.tags,
        visibility: "private", // Saved recipes are private
        servings: communityRecipe.servings,
        totalTimeMinutes: communityRecipe.totalTimeMinutes,
        sourceUrl: communityRecipe.sourceUrl,
        notes: communityRecipe.notes,
        favorited: false,
        ingredients: {
          create: communityRecipe.ingredients.map((ing: { name: string; quantity?: number | null; unit?: string | null; note?: string | null; foodItemId?: string | null }, idx: number) => ({
            name: ing.name,
            quantity: ing.quantity ?? null,
            unit: ing.unit ?? null,
            note: ing.note ?? null,
            order: idx,
            foodItemId: ing.foodItemId ?? null,
          })),
        },
        steps: {
          create: communityRecipe.steps.map((step: { text: string }, idx: number) => ({
            text: step.text,
            order: idx,
          })),
        },
      },
      include: {
        ingredients: {
          orderBy: { order: "asc" },
        },
        steps: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({
      success: true,
      recipe: {
        id: copiedRecipe.id,
        title: copiedRecipe.title,
      },
    });
  } catch (error) {
    console.error("Error saving community recipe:", error);
    return NextResponse.json(
      { error: "Failed to save community recipe" },
      { status: 500 }
    );
  }
}


