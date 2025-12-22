import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// GET /api/community/recipes - Browse community recipes
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tag = searchParams.get("tag");
    const sort = searchParams.get("sort") || "recent"; // 'recent' | 'trending' | 'popular'
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build where clause
    const where: Prisma.RecipeWhereInput = {
      visibility: {
        in: ["public", "unlisted"],
      },
    };

    if (tag) {
      where.tags = {
        has: tag,
      };
    }

    // Build orderBy
    let orderBy: Prisma.RecipeOrderByWithRelationInput = { createdAt: "desc" };
    if (sort === "trending") {
      // For trending, we'd ideally use a combination of likes and recent activity
      // For now, we'll use a simple approach: recipes with most likes in last 7 days
      orderBy = { createdAt: "desc" };
    } else if (sort === "popular") {
      // Order by number of saves (we'll need to count these)
      orderBy = { createdAt: "desc" };
    }

    const recipes = await prisma.recipe.findMany({
      where,
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
      orderBy,
      take: limit,
      skip: offset,
    });

    // Get like/save counts for current user
    const recipeIds = recipes.map((r: { id: string }) => r.id);
    const userLikes = await prisma.communityRecipeLike.findMany({
      where: {
        recipeId: { in: recipeIds },
        userId,
      },
    });
    const userSaves = await prisma.communityRecipeSave.findMany({
      where: {
        recipeId: { in: recipeIds },
        userId,
      },
    });

    // likedRecipeIds and savedRecipeIds are computed but not currently used in the response
    // const likedRecipeIds = new Set(userLikes.map((l: { recipeId: string }) => l.recipeId));
    // const savedRecipeIds = new Set(userSaves.map((s: { recipeId: string }) => s.recipeId));

    // Transform to match component interface
    const transformed = recipes.map((recipe: {
      id: string;
      title: string;
      description: string | null;
      photoUrl: string | null;
      tags: string[];
      servings: number | null;
      totalTimeMinutes: number | null;
      sourceUrl: string | null;
      visibility: string;
      householdId: string;
      household: {
        id: string;
        name: string;
        members: Array<{ user: { id: string; name: string | null; image: string | null } | null }>;
      };
      ingredients: Array<{ id: string; name: string; quantity: number | null; unit: string | null; note: string | null }>;
      steps: Array<{ id: string; text: string }>;
      communityLikes: Array<{ id: string }>;
      communitySaves: Array<{ id: string }>;
      createdAt: Date;
    }) => {
      const author = recipe.household.members[0]?.user;
      return {
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
        createdAt: recipe.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ recipes: transformed });
  } catch (error) {
    console.error("Error fetching community recipes:", error);
    return NextResponse.json(
      { error: "Failed to fetch community recipes" },
      { status: 500 }
    );
  }
}

