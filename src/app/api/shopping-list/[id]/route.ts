import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateShoppingListItemSchema = z.object({
  name: z.string().min(1).optional(),
  checked: z.boolean().optional(),
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
});

// PUT /api/shopping-list/[id] - Update shopping list item
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify the item belongs to the household's shopping list
    const shoppingList = await prisma.shoppingList.findUnique({
      where: { householdId },
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

    const item = await prisma.shoppingListItem.findUnique({
      where: { id: params.id },
    });

    if (!item || item.shoppingListId !== shoppingList.id) {
      return NextResponse.json(
        { error: "Shopping list item not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validated = updateShoppingListItemSchema.parse(body);

    const updated = await prisma.shoppingListItem.update({
      where: { id: params.id },
      data: {
        name: validated.name !== undefined ? validated.name : item.name,
        checked: validated.checked !== undefined ? validated.checked : item.checked,
        quantity: validated.quantity !== undefined ? validated.quantity : item.quantity,
        unit: validated.unit !== undefined ? validated.unit : item.unit,
        category: validated.category !== undefined ? validated.category : item.category,
        note: validated.note !== undefined ? validated.note : item.note,
      },
      include: {
        foodItem: true,
        recipe: true,
      },
    });

    const transformed = {
      id: updated.id,
      name: updated.name,
      quantity: updated.quantity || undefined,
      unit: (updated.unit as any) || undefined,
      category: (updated.category as any) || undefined,
      checked: updated.checked,
      note: updated.note || undefined,
      source: (updated.source as any) || undefined,
      recipeId: updated.recipeId || undefined,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating shopping list item:", error);
    return NextResponse.json(
      { error: "Failed to update shopping list item" },
      { status: 500 }
    );
  }
}

// DELETE /api/shopping-list/[id] - Delete shopping list item
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    // Verify the item belongs to the household's shopping list
    const shoppingList = await prisma.shoppingList.findUnique({
      where: { householdId },
    });

    if (!shoppingList) {
      return NextResponse.json(
        { error: "Shopping list not found" },
        { status: 404 }
      );
    }

    const item = await prisma.shoppingListItem.findUnique({
      where: { id: params.id },
    });

    if (!item || item.shoppingListId !== shoppingList.id) {
      return NextResponse.json(
        { error: "Shopping list item not found" },
        { status: 404 }
      );
    }

    await prisma.shoppingListItem.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting shopping list item:", error);
    return NextResponse.json(
      { error: "Failed to delete shopping list item" },
      { status: 500 }
    );
  }
}
