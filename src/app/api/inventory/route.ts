import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { getUniqueKitchenLocations, transformLocation } from "@/lib/inventory";
import { z } from "zod";

const createInventoryItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  locationId: z.enum(["pantry", "fridge", "freezer"]),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.enum(["count", "g", "kg", "oz", "lb", "ml", "l"]),
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

// GET /api/inventory - List inventory items
export async function GET() {
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

    const items = await prisma.inventoryItem.findMany({
      where: { householdId },
      include: {
        foodItem: true,
        location: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Get unique locations (deduplicated by type)
    const transformedLocations = await getUniqueKitchenLocations(householdId);
    
    // Also get all locations for mapping items
    const allLocations = await prisma.kitchenLocation.findMany({
      where: { householdId },
    });

    // Create a map of location database ID to transformed location ID for items
    const locationMap = new Map<string, "pantry" | "fridge" | "freezer">();
    allLocations.forEach((loc: { id: string; name: string }) => {
      locationMap.set(loc.id, transformLocation(loc).id);
    });

    // Transform to match component interface
    const transformed = items.map((item: {
      id: string;
      foodItem: { name: string };
      locationId: string;
      quantity: number;
      unit: string;
      expiresOn: Date | null;
      category: string | null;
      notes: string | null;
      photoUrl: string | null;
      barcode: string | null;
    }) => ({
      id: item.id,
      name: item.foodItem.name,
      locationId: locationMap.get(item.locationId) || "pantry",
      quantity: item.quantity,
      unit: item.unit as "count" | "g" | "kg" | "oz" | "lb" | "ml" | "l",
      expiresOn: item.expiresOn ? item.expiresOn.toISOString().split("T")[0] : undefined,
      category: item.category || undefined,
      notes: item.notes || undefined,
      photoUrl: item.photoUrl || undefined,
      barcode: item.barcode || undefined,
    }));

    return NextResponse.json({
      items: transformed,
      locations: transformedLocations,
    });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

// POST /api/inventory - Create inventory item
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

    // Ensure locations exist (getUniqueKitchenLocations handles this)
    await getUniqueKitchenLocations(householdId);

    const body = await request.json();
    const validated = createInventoryItemSchema.parse(body);

    // Find or create FoodItem
    let foodItem = await prisma.foodItem.findFirst({
      where: { name: { equals: validated.name, mode: "insensitive" } },
    });

    if (!foodItem) {
      foodItem = await prisma.foodItem.create({
        data: { name: validated.name },
      });
    }

    // Find location by name (since we map by name, not ID)
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

    // Create barcode mapping if barcode is provided
    if (validated.barcode) {
      // Determine barcode type (UPC is typically 12 digits, EAN is 13 digits)
      const barcodeType = validated.barcode.length === 12 ? "UPC" : "EAN";
      
      // Create or update barcode mapping
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

    // Create inventory item
    const inventoryItem = await prisma.inventoryItem.create({
      data: {
        householdId,
        foodItemId: foodItem.id,
        locationId: location.id,
        quantity: validated.quantity,
        unit: validated.unit,
        expiresOn: validated.expiresOn ? new Date(validated.expiresOn) : null,
        category: validated.category || null,
        notes: validated.notes || null,
        barcode: validated.barcode || null,
      },
      include: {
        foodItem: true,
        location: true,
      },
    });

    const transformed = {
      id: inventoryItem.id,
      name: inventoryItem.foodItem.name,
      locationId: transformLocation(inventoryItem.location).id,
      quantity: inventoryItem.quantity,
      unit: inventoryItem.unit as "count" | "g" | "kg" | "oz" | "lb" | "ml" | "l",
      expiresOn: inventoryItem.expiresOn
        ? inventoryItem.expiresOn.toISOString().split("T")[0]
        : undefined,
      category: inventoryItem.category || undefined,
      notes: inventoryItem.notes || undefined,
      photoUrl: inventoryItem.photoUrl || undefined,
      barcode: inventoryItem.barcode || undefined,
    };

    return NextResponse.json(transformed, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating inventory item:", error);
    return NextResponse.json(
      { error: "Failed to create inventory item" },
      { status: 500 }
    );
  }
}

