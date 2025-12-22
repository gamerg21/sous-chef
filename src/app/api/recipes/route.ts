import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createRecipeSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(["private", "household"]).default("private"),
  servings: z.number().positive().optional(),
  totalTimeMinutes: z.number().positive().optional(),
  sourceUrl: z.string().optional().or(z.literal("")),
  notes: z.string().optional(),
  ingredients: z.array(
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
  ),
  steps: z.array(
    z.object({
      id: z.string(),
      text: z.string().min(1),
    })
  ),
});

// GET /api/recipes - List recipes
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

    const recipes = await prisma.recipe.findMany({
      where: { householdId },
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
      orderBy: { updatedAt: "desc" },
    });

    // Transform to match component interface
    const transformed = recipes.map((recipe: {
      id: string;
      title: string;
      description: string | null;
      photoUrl: string | null;
      tags: string[];
      visibility: string;
      servings: number | null;
      totalTimeMinutes: number | null;
      sourceUrl: string | null;
      notes: string | null;
      ingredients: Array<{ id: string; name: string; quantity: number | null; unit: string | null; note: string | null }>;
      steps: Array<{ id: string; text: string }>;
      updatedAt: Date;
      lastCookedAt: Date | null;
      favorited: boolean;
    }) => ({
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
      ingredients: recipe.ingredients.map((ing: { id: string; name: string; quantity: number | null; unit: string | null; note: string | null }, idx: number) => ({
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
          : undefined,
      })),
      steps: recipe.steps.map((step: { id: string; text: string }) => ({
        id: step.id,
        text: step.text,
      })),
      updatedAt: recipe.updatedAt.toISOString().split("T")[0],
      lastCookedAt: recipe.lastCookedAt
        ? recipe.lastCookedAt.toISOString().split("T")[0]
        : undefined,
      favorited: recipe.favorited,
    }));

    return NextResponse.json({ recipes: transformed });
  } catch (error) {
    console.error("Error fetching recipes:", error);
    return NextResponse.json(
      { error: "Failed to fetch recipes" },
      { status: 500 }
    );
  }
}

// POST /api/recipes - Create recipe
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
    const validated = createRecipeSchema.parse(body);

    // Create recipe
    const recipe = await prisma.recipe.create({
      data: {
        householdId,
        title: validated.title,
        description: validated.description || null,
        tags: validated.tags || [],
        visibility: validated.visibility,
        servings: validated.servings || null,
        totalTimeMinutes: validated.totalTimeMinutes || null,
        sourceUrl: validated.sourceUrl || null,
        notes: validated.notes || null,
        favorited: false,
        ingredients: {
          create: validated.ingredients.map((ing, idx) => ({
            name: ing.name,
            quantity: ing.quantity || null,
            unit: ing.unit || null,
            note: ing.mapping
              ? `MAPPING:${ing.mapping.inventoryItemLabel}`
              : ing.note || null,
            order: idx,
            // Try to find matching FoodItem for mapping
            foodItemId: null, // We'll implement this later if needed
          })),
        },
        steps: {
          create: validated.steps.map((step, idx) => ({
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
      ingredients: recipe.ingredients.map((ing: { id: string; name: string; quantity: number | null; unit: string | null; note: string | null }) => ({
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
      steps: recipe.steps.map((step: { id: string; text: string }) => ({
        id: step.id,
        text: step.text,
      })),
      updatedAt: recipe.updatedAt.toISOString().split("T")[0],
      lastCookedAt: recipe.lastCookedAt
        ? recipe.lastCookedAt.toISOString().split("T")[0]
        : undefined,
      favorited: recipe.favorited,
    };

    return NextResponse.json(transformed, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating recipe:", error);
    return NextResponse.json(
      { error: "Failed to create recipe" },
      { status: 500 }
    );
  }
}

