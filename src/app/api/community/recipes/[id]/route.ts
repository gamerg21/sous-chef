import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/community/recipes/[id] - Get single community recipe
export async function GET(
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

    const recipe = await prisma.recipe.findFirst({
      where: {
        id,
        visibility: {
          in: ["public", "unlisted"],
        },
      },
      include: {
        household: {
          include: {
            members: {
              include: {
                user: true,
              },
              take: 1,
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
        ingredients: {
          orderBy: { order: "asc" },
        },
        steps: {
          orderBy: { order: "asc" },
        },
        communityLikes: true,
        communitySaves: true,
      },
    });

    if (!recipe) {
      return NextResponse.json(
        { error: "Community recipe not found" },
        { status: 404 }
      );
    }

    // Check if user has liked/saved this recipe
    const userLike = await prisma.communityRecipeLike.findFirst({
      where: {
        recipeId: id,
        userId,
      },
    });
    const userSave = await prisma.communityRecipeSave.findFirst({
      where: {
        recipeId: id,
        userId,
      },
    });

    const author = recipe.household.members[0]?.user;

    // Transform to match component interface
    const transformed = {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description || undefined,
      photoUrl: recipe.photoUrl || undefined,
      tags: recipe.tags.length > 0 ? recipe.tags : undefined,
      servings: recipe.servings || undefined,
      totalTimeMinutes: recipe.totalTimeMinutes || undefined,
      sourceUrl: recipe.sourceUrl || undefined,
      ingredients: recipe.ingredients.map((ing: { id: string; name: string; quantity: number | null; unit: string | null; note: string | null }) => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity || undefined,
        unit: ing.unit || undefined,
        note: ing.note || undefined,
      })),
      steps: recipe.steps.map((step: { id: string; text: string }) => ({
        id: step.id,
        text: step.text,
      })),
      author: {
        id: author?.id || recipe.householdId,
        name: author?.name || recipe.household.name,
        avatarUrl: author?.image || undefined,
      },
      likes: recipe.communityLikes.length,
      savedCount: recipe.communitySaves.length,
      isLiked: !!userLike,
      isSaved: !!userSave,
      createdAt: recipe.createdAt.toISOString(),
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching community recipe:", error);
    return NextResponse.json(
      { error: "Failed to fetch community recipe" },
      { status: 500 }
    );
  }
}

