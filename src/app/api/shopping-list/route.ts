import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createShoppingListItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  category: z
    .enum([
      "Produce",
      "Dairy",
      "Meat & Seafood",
      "Pantry",
      "Frozen",
      "Bakery",
      "Other",
    ])
    .optional(),
  note: z.string().optional(),
  source: z.enum(["manual", "from-recipe", "low-stock"]).default("manual"),
  recipeId: z.string().optional(),
});

// GET /api/shopping-list - Get shopping list
export async function GET(_request: NextRequest) {
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

    // Get or create shopping list
    let shoppingList = await prisma.shoppingList.findUnique({
      where: { householdId },
      include: {
        items: {
          include: {
            foodItem: true,
            recipe: true,
          },
          orderBy: [
            { checked: "asc" },
            { createdAt: "desc" },
          ],
        },
      },
    });

    if (!shoppingList) {
      shoppingList = await prisma.shoppingList.create({
        data: { householdId },
        include: {
          items: {
            include: {
              foodItem: true,
              recipe: true,
            },
            orderBy: [
              { checked: "asc" },
              { createdAt: "desc" },
            ],
          },
        },
      });
    }

    // Transform to match component interface
    const items = shoppingList.items.map((item: {
      id: string;
      name: string;
      quantity: number | null;
      unit: string | null;
      category: string | null;
      checked: boolean;
      note: string | null;
      source: string | null;
      recipeId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity || undefined,
      unit: item.unit || undefined,
      category: item.category || undefined,
      checked: item.checked,
      note: item.note || undefined,
      source: item.source || undefined,
      recipeId: item.recipeId || undefined,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching shopping list:", error);
    return NextResponse.json(
      { error: "Failed to fetch shopping list" },
      { status: 500 }
    );
  }
}

// POST /api/shopping-list - Add item to shopping list
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
    const validated = createShoppingListItemSchema.parse(body);

    // Get or create shopping list
    let shoppingList = await prisma.shoppingList.findUnique({
      where: { householdId },
    });

    if (!shoppingList) {
      shoppingList = await prisma.shoppingList.create({
        data: { householdId },
      });
    }

    // Find or create FoodItem
    let foodItem = await prisma.foodItem.findFirst({
      where: { name: { equals: validated.name, mode: "insensitive" } },
    });

    if (!foodItem) {
      foodItem = await prisma.foodItem.create({
        data: { name: validated.name },
      });
    }

    // Create shopping list item
    const item = await prisma.shoppingListItem.create({
      data: {
        shoppingListId: shoppingList.id,
        foodItemId: foodItem.id,
        name: validated.name,
        quantity: validated.quantity || null,
        unit: validated.unit || null,
        category: validated.category || null,
        note: validated.note || null,
        source: validated.source,
        recipeId: validated.recipeId || null,
      },
      include: {
        foodItem: true,
        recipe: true,
      },
    });

    const transformed = {
      id: item.id,
      name: item.name,
      quantity: item.quantity || undefined,
      unit: item.unit || undefined,
      category: item.category || undefined,
      checked: item.checked,
      note: item.note || undefined,
      source: item.source || undefined,
      recipeId: item.recipeId || undefined,
    };

    return NextResponse.json(transformed, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error adding shopping list item:", error);
    return NextResponse.json(
      { error: "Failed to add shopping list item" },
      { status: 500 }
    );
  }
}


