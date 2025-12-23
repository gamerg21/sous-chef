import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const publishRecipeSchema = z.object({
  recipeId: z.string(),
  visibility: z.enum(["public", "unlisted"]),
});

// POST /api/community/recipes/publish - Publish a recipe to community
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
    const validated = publishRecipeSchema.parse(body);

    // Verify recipe exists and belongs to household
    const recipe = await prisma.recipe.findFirst({
      where: {
        id: validated.recipeId,
        householdId,
      },
    });

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // Update recipe visibility
    const updatedRecipe = await prisma.recipe.update({
      where: { id: validated.recipeId },
      data: {
        visibility: validated.visibility,
      },
    });

    return NextResponse.json({
      success: true,
      recipe: {
        id: updatedRecipe.id,
        title: updatedRecipe.title,
        visibility: updatedRecipe.visibility,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error publishing recipe:", error);
    return NextResponse.json(
      { error: "Failed to publish recipe" },
      { status: 500 }
    );
  }
}


