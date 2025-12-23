import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/community/recipes/[id]/like - Like/unlike a community recipe
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

    // Verify recipe exists and is public/unlisted
    const recipe = await prisma.recipe.findFirst({
      where: {
        id,
        visibility: {
          in: ["public", "unlisted"],
        },
      },
    });

    if (!recipe) {
      return NextResponse.json(
        { error: "Community recipe not found" },
        { status: 404 }
      );
    }

    // Check if user already liked this recipe
    const existingLike = await prisma.communityRecipeLike.findFirst({
      where: {
        recipeId: id,
        userId,
      },
    });

    if (existingLike) {
      // Unlike: delete the like
      await prisma.communityRecipeLike.delete({
        where: { id: existingLike.id },
      });
      return NextResponse.json({ liked: false });
    } else {
      // Like: create the like
      await prisma.communityRecipeLike.create({
        data: {
          recipeId: id,
          userId,
        },
      });
      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    console.error("Error toggling like:", error);
    return NextResponse.json(
      { error: "Failed to toggle like" },
      { status: 500 }
    );
  }
}


