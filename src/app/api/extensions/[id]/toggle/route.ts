import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const toggleExtensionSchema = z.object({
  enabled: z.boolean(),
});

// POST /api/extensions/[id]/toggle - Enable/disable an extension
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

    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    const { id } = await params;
    const body = await request.json();
    const validated = toggleExtensionSchema.parse(body);

    // Find installed extension
    const installed = await prisma.installedExtension.findUnique({
      where: {
        extensionId_householdId: {
          extensionId: id,
          householdId,
        },
      },
    });

    if (!installed) {
      return NextResponse.json(
        { error: "Extension not installed" },
        { status: 404 }
      );
    }

    // Update enabled status
    const updated = await prisma.installedExtension.update({
      where: { id: installed.id },
      data: {
        enabled: validated.enabled,
      },
    });

    return NextResponse.json({
      success: true,
      installedExtension: {
        extensionId: updated.extensionId,
        enabled: updated.enabled,
        needsConfiguration: updated.needsConfiguration,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error toggling extension:", error);
    return NextResponse.json(
      { error: "Failed to toggle extension" },
      { status: 500 }
    );
  }
}


