import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateRecipeSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(["private", "household"]).optional(),
  servings: z.number().positive().optional().nullable(),
  totalTimeMinutes: z.number().positive().optional().nullable(),
  sourceUrl: z.string().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  ingredients: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        quantity: z.number().optional(),
        unit: z.string().optional(),
        note: z.string().optional(),
        mapping: z
          .object({
            inventoryItemLabel: z.string(),
            locationHint: z.string().optional(),
            suggested: z.boolean().optional(),
          })
          .optional(),
      })
    )
    .optional(),
  steps: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1),
      })
    )
    .optional(),
});

// GET /api/recipes/[id] - Get single recipe
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    const recipe = await prisma.recipe.findFirst({
      where: {
        id,
        householdId,
      },
      include: {
        ingredients: {
          include: {
            foodItem: true,
          },
          orderBy: { order: "asc" },
        },
        steps: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // Transform to match component interface
    const transformed = {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description || undefined,
      photoUrl: recipe.photoUrl || undefined,
      tags: recipe.tags.length > 0 ? recipe.tags : undefined,
      visibility: recipe.visibility as "private" | "household",
      servings: recipe.servings || undefined,
      totalTimeMinutes: recipe.totalTimeMinutes || undefined,
      sourceUrl: recipe.sourceUrl || undefined,
      notes: recipe.notes || undefined,
      ingredients: recipe.ingredients.map((ing) => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity || undefined,
        unit: ing.unit || undefined,
        note: ing.note && !ing.note.startsWith("MAPPING:")
          ? ing.note
          : undefined,
        mapping: ing.note && ing.note.startsWith("MAPPING:")
          ? {
              inventoryItemLabel: ing.note.replace("MAPPING:", "").trim(),
              suggested: false,
            }
          : undefined,
      })),
      steps: recipe.steps.map((step) => ({
        id: step.id,
        text: step.text,
      })),
      updatedAt: recipe.updatedAt.toISOString().split("T")[0],
      lastCookedAt: recipe.lastCookedAt
        ? recipe.lastCookedAt.toISOString().split("T")[0]
        : undefined,
      favorited: recipe.favorited,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching recipe:", error);
    return NextResponse.json(
      { error: "Failed to fetch recipe" },
      { status: 500 }
    );
  }
}

// PUT /api/recipes/[id] - Update recipe
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    // Verify recipe exists and belongs to household
    const existingRecipe = await prisma.recipe.findFirst({
      where: {
        id,
        householdId,
      },
    });

    if (!existingRecipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateRecipeSchema.parse(body);

    // Update recipe
    const recipe = await prisma.recipe.update({
      where: { id },
      data: {
        title: validated.title,
        description: validated.description !== undefined ? validated.description : undefined,
        tags: validated.tags !== undefined ? validated.tags : undefined,
        visibility: validated.visibility,
        servings: validated.servings !== undefined ? validated.servings : undefined,
        totalTimeMinutes: validated.totalTimeMinutes !== undefined ? validated.totalTimeMinutes : undefined,
        sourceUrl: validated.sourceUrl !== undefined ? validated.sourceUrl : undefined,
        notes: validated.notes !== undefined ? validated.notes : undefined,
        ...(validated.ingredients !== undefined && {
          ingredients: {
            deleteMany: {},
            create: validated.ingredients.map((ing, idx) => ({
              name: ing.name,
              quantity: ing.quantity || null,
              unit: ing.unit || null,
              note: ing.mapping
                ? `MAPPING:${ing.mapping.inventoryItemLabel}`
                : ing.note || null,
              order: idx,
            })),
          },
        }),
        ...(validated.steps !== undefined && {
          steps: {
            deleteMany: {},
            create: validated.steps.map((step, idx) => ({
              text: step.text,
              order: idx,
            })),
          },
        }),
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

    // Transform to match component interface
    const transformed = {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description || undefined,
      photoUrl: recipe.photoUrl || undefined,
      tags: recipe.tags.length > 0 ? recipe.tags : undefined,
      visibility: recipe.visibility as "private" | "household",
      servings: recipe.servings || undefined,
      totalTimeMinutes: recipe.totalTimeMinutes || undefined,
      sourceUrl: recipe.sourceUrl || undefined,
      notes: recipe.notes || undefined,
      ingredients: recipe.ingredients.map((ing) => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity || undefined,
        unit: ing.unit || undefined,
        note: ing.note && !ing.note.startsWith("MAPPING:")
          ? ing.note
          : undefined,
        mapping: ing.note && ing.note.startsWith("MAPPING:")
          ? {
              inventoryItemLabel: ing.note.replace("MAPPING:", "").trim(),
              suggested: false,
            }
          : undefined,
      })),
      steps: recipe.steps.map((step) => ({
        id: step.id,
        text: step.text,
      })),
      updatedAt: recipe.updatedAt.toISOString().split("T")[0],
      lastCookedAt: recipe.lastCookedAt
        ? recipe.lastCookedAt.toISOString().split("T")[0]
        : undefined,
      favorited: recipe.favorited,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating recipe:", error);
    return NextResponse.json(
      { error: "Failed to update recipe" },
      { status: 500 }
    );
  }
}

// DELETE /api/recipes/[id] - Delete recipe
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    // Verify recipe exists and belongs to household
    const recipe = await prisma.recipe.findFirst({
      where: {
        id,
        householdId,
      },
    });

    if (!recipe) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    await prisma.recipe.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting recipe:", error);
    return NextResponse.json(
      { error: "Failed to delete recipe" },
      { status: 500 }
    );
  }
}

