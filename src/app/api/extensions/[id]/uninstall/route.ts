import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// POST /api/extensions/[id]/uninstall - Uninstall an extension
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

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

    // Uninstall extension
    await prisma.installedExtension.delete({
      where: { id: installed.id },
    });

    // Update install count
    await prisma.extensionListing.update({
      where: { id },
      data: {
        installs: {
          decrement: 1,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error uninstalling extension:", error);
    return NextResponse.json(
      { error: "Failed to uninstall extension" },
      { status: 500 }
    );
  }
}

