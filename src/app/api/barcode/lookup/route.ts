import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const lookupBarcodeSchema = z.object({
  code: z.string().min(1, "Barcode code is required"),
});

// GET /api/barcode/lookup?code=... - Lookup barcode and return FoodItem
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "Barcode code is required" },
        { status: 400 }
      );
    }

    // Validate the code format
    const validated = lookupBarcodeSchema.parse({ code });

    // Look up barcode in database
    const barcode = await prisma.barcode.findUnique({
      where: { code: validated.code },
      include: {
        foodItem: true,
      },
    });

    if (!barcode) {
      // Barcode not found in database
      // In the future, this could call an external API like Open Food Facts
      return NextResponse.json(
        { error: "Barcode not found", code: validated.code },
        { status: 404 }
      );
    }

    return NextResponse.json({
      barcode: {
        id: barcode.id,
        code: barcode.code,
        type: barcode.type as "UPC" | "EAN",
      },
      foodItem: {
        id: barcode.foodItem.id,
        name: barcode.foodItem.name,
        canonicalName: barcode.foodItem.canonicalName || undefined,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error looking up barcode:", error);
    return NextResponse.json(
      { error: "Failed to lookup barcode" },
      { status: 500 }
    );
  }
}

// POST /api/barcode - Create or update barcode mapping
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const schema = z.object({
      code: z.string().min(1, "Barcode code is required"),
      type: z.enum(["UPC", "EAN"]),
      foodItemId: z.string().optional(),
      foodItemName: z.string().optional(),
    });

    const validated = schema.parse(body);

    // If foodItemId is provided, use it; otherwise create/find by name
    let foodItem;
    if (validated.foodItemId) {
      foodItem = await prisma.foodItem.findUnique({
        where: { id: validated.foodItemId },
      });
      if (!foodItem) {
        return NextResponse.json(
          { error: "FoodItem not found" },
          { status: 404 }
        );
      }
    } else if (validated.foodItemName) {
      // Find or create FoodItem by name
      foodItem = await prisma.foodItem.findFirst({
        where: { name: { equals: validated.foodItemName, mode: "insensitive" } },
      });

      if (!foodItem) {
        foodItem = await prisma.foodItem.create({
          data: { name: validated.foodItemName },
        });
      }
    } else {
      return NextResponse.json(
        { error: "Either foodItemId or foodItemName is required" },
        { status: 400 }
      );
    }

    // Create or update barcode mapping
    const barcode = await prisma.barcode.upsert({
      where: { code: validated.code },
      update: {
        foodItemId: foodItem.id,
        type: validated.type,
      },
      create: {
        code: validated.code,
        type: validated.type,
        foodItemId: foodItem.id,
      },
      include: {
        foodItem: true,
      },
    });

    return NextResponse.json({
      barcode: {
        id: barcode.id,
        code: barcode.code,
        type: barcode.type as "UPC" | "EAN",
      },
      foodItem: {
        id: barcode.foodItem.id,
        name: barcode.foodItem.name,
        canonicalName: barcode.foodItem.canonicalName || undefined,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error creating barcode mapping:", error);
    return NextResponse.json(
      { error: "Failed to create barcode mapping" },
      { status: 500 }
    );
  }
}

