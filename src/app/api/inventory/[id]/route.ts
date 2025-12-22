import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { transformLocation } from "@/lib/inventory";
import { z } from "zod";

const updateInventoryItemSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  locationId: z.enum(["pantry", "fridge", "freezer"]).optional(),
  quantity: z.number().positive("Quantity must be positive").optional(),
  unit: z.enum(["count", "g", "kg", "oz", "lb", "ml", "l"]).optional(),
  expiresOn: z.string().optional().nullable().or(z.literal("")),
  category: z.string().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable().or(z.literal("")),
  barcode: z.string().optional().nullable().or(z.literal("")),
}).transform((data) => ({
  ...data,
  expiresOn: data.expiresOn && data.expiresOn.trim() ? data.expiresOn : undefined,
  category: data.category && data.category.trim() ? data.category : undefined,
  notes: data.notes && data.notes.trim() ? data.notes : undefined,
  barcode: data.barcode && data.barcode.trim() ? data.barcode : undefined,
}));

// GET /api/inventory/[id] - Get single inventory item
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
    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    const item = await prisma.inventoryItem.findFirst({
      where: {
        id,
        householdId,
      },
      include: {
        foodItem: true,
        location: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const transformed = {
      id: item.id,
      name: item.foodItem.name,
      locationId: transformLocation(item.location).id,
      quantity: item.quantity,
      unit: item.unit as "count" | "g" | "kg" | "oz" | "lb" | "ml" | "l",
      expiresOn: item.expiresOn
        ? item.expiresOn.toISOString().split("T")[0]
        : undefined,
      category: item.category || undefined,
      notes: item.notes || undefined,
      photoUrl: item.photoUrl || undefined,
      barcode: item.barcode || undefined,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching inventory item:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory item" },
      { status: 500 }
    );
  }
}

// PUT /api/inventory/[id] - Update inventory item
export async function PUT(
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

    // Verify item exists and belongs to household
    const existingItem = await prisma.inventoryItem.findFirst({
      where: {
        id,
        householdId,
      },
      include: {
        foodItem: true,
      },
    });

    if (!existingItem) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateInventoryItemSchema.parse(body);

    // Find location by name if locationId is provided
    let locationIdToUse = existingItem.locationId;
    if (validated.locationId) {
      const locationName = validated.locationId === 'pantry' ? 'Pantry' 
        : validated.locationId === 'fridge' ? 'Fridge'
        : 'Freezer';
      
      const location = await prisma.kitchenLocation.findFirst({
        where: { 
          householdId,
          name: locationName,
        },
      });

      if (!location) {
        return NextResponse.json(
          { error: "Invalid location" },
          { status: 400 }
        );
      }

      locationIdToUse = location.id;
    }

    // Update FoodItem if name changed
    if (validated.name && validated.name !== existingItem.foodItem.name) {
      let foodItem = await prisma.foodItem.findFirst({
        where: { name: { equals: validated.name, mode: "insensitive" } },
      });

      if (!foodItem) {
        foodItem = await prisma.foodItem.create({
          data: { name: validated.name },
        });
      }

      // Create or update barcode mapping if barcode is provided
      if (validated.barcode) {
        const barcodeType = validated.barcode.length === 12 ? "UPC" : "EAN";
        await prisma.barcode.upsert({
          where: { code: validated.barcode },
          update: {
            foodItemId: foodItem.id,
            type: barcodeType,
          },
          create: {
            code: validated.barcode,
            type: barcodeType,
            foodItemId: foodItem.id,
          },
        });
      }

      // Update inventory item with new foodItemId
      const updated = await prisma.inventoryItem.update({
        where: { id },
        data: {
          foodItemId: foodItem.id,
          locationId: locationIdToUse,
          quantity: validated.quantity,
          unit: validated.unit,
          expiresOn: validated.expiresOn !== undefined
            ? validated.expiresOn === null
              ? null
              : new Date(validated.expiresOn)
            : undefined,
          category: validated.category !== undefined ? validated.category : undefined,
          notes: validated.notes !== undefined ? validated.notes : undefined,
          barcode: validated.barcode !== undefined ? validated.barcode : undefined,
        },
        include: {
          foodItem: true,
          location: true,
        },
      });

      const transformed = {
        id: updated.id,
        name: updated.foodItem.name,
        locationId: transformLocation(updated.location).id,
        quantity: updated.quantity,
        unit: updated.unit as "count" | "g" | "kg" | "oz" | "lb" | "ml" | "l",
        expiresOn: updated.expiresOn
          ? updated.expiresOn.toISOString().split("T")[0]
          : undefined,
        category: updated.category || undefined,
        notes: updated.notes || undefined,
        photoUrl: updated.photoUrl || undefined,
        barcode: updated.barcode || undefined,
      };

      return NextResponse.json(transformed);
    } else {
      // Create or update barcode mapping if barcode is provided
      if (validated.barcode) {
        const barcodeType = validated.barcode.length === 12 ? "UPC" : "EAN";
        await prisma.barcode.upsert({
          where: { code: validated.barcode },
          update: {
            foodItemId: existingItem.foodItemId,
            type: barcodeType,
          },
          create: {
            code: validated.barcode,
            type: barcodeType,
            foodItemId: existingItem.foodItemId,
          },
        });
      }

      // Update without changing foodItem
      const updated = await prisma.inventoryItem.update({
        where: { id },
        data: {
          locationId: locationIdToUse,
          quantity: validated.quantity,
          unit: validated.unit,
          expiresOn: validated.expiresOn !== undefined
            ? validated.expiresOn === null
              ? null
              : new Date(validated.expiresOn)
            : undefined,
          category: validated.category !== undefined ? validated.category : undefined,
          notes: validated.notes !== undefined ? validated.notes : undefined,
          barcode: validated.barcode !== undefined ? validated.barcode : undefined,
        },
        include: {
          foodItem: true,
          location: true,
        },
      });

      const transformed = {
        id: updated.id,
        name: updated.foodItem.name,
        locationId: transformLocation(updated.location).id,
        quantity: updated.quantity,
        unit: updated.unit as "count" | "g" | "kg" | "oz" | "lb" | "ml" | "l",
        expiresOn: updated.expiresOn
          ? updated.expiresOn.toISOString().split("T")[0]
          : undefined,
        category: updated.category || undefined,
        notes: updated.notes || undefined,
        photoUrl: updated.photoUrl || undefined,
        barcode: updated.barcode || undefined,
      };

      return NextResponse.json(transformed);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating inventory item:", error);
    return NextResponse.json(
      { error: "Failed to update inventory item" },
      { status: 500 }
    );
  }
}

// DELETE /api/inventory/[id] - Delete inventory item
export async function DELETE(
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

    // Verify item exists and belongs to household
    const item = await prisma.inventoryItem.findFirst({
      where: {
        id,
        householdId,
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    await prisma.inventoryItem.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    return NextResponse.json(
      { error: "Failed to delete inventory item" },
      { status: 500 }
    );
  }
}

