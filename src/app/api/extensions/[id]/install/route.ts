import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// POST /api/extensions/[id]/install - Install an extension
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

    // Verify extension exists
    const extension = await prisma.extensionListing.findUnique({
      where: { id },
    });

    if (!extension) {
      return NextResponse.json({ error: "Extension not found" }, { status: 404 });
    }

    // Check if already installed
    const existing = await prisma.installedExtension.findUnique({
      where: {
        extensionId_householdId: {
          extensionId: id,
          householdId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Extension already installed" },
        { status: 400 }
      );
    }

    // Install extension
    const installed = await prisma.installedExtension.create({
      data: {
        extensionId: id,
        householdId,
        enabled: true,
        needsConfiguration: extension.permissions.length > 0,
      },
    });

    // Update install count
    await prisma.extensionListing.update({
      where: { id },
      data: {
        installs: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      installedExtension: {
        extensionId: installed.extensionId,
        enabled: installed.enabled,
        needsConfiguration: installed.needsConfiguration,
      },
    });
  } catch (error) {
    console.error("Error installing extension:", error);
    return NextResponse.json(
      { error: "Failed to install extension" },
      { status: 500 }
    );
  }
}


