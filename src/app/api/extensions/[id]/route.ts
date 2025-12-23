import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// GET /api/extensions/[id] - Get extension details
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

    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    const { id } = await params;

    const extension = await prisma.extensionListing.findUnique({
      where: { id },
      include: {
        installedExtensions: {
          where: {
            householdId,
          },
        },
      },
    });

    if (!extension) {
      return NextResponse.json({ error: "Extension not found" }, { status: 404 });
    }

    // Transform to match component interface
    const transformed = {
      id: extension.id,
      name: extension.name,
      description: extension.description,
      category: extension.category,
      tags: extension.tags.length > 0 ? extension.tags : undefined,
      author: {
        name: extension.authorName,
        verified: false,
        url: extension.authorUrl || undefined,
      },
      pricing: extension.pricing as "free" | "paid" | "trial",
      rating: extension.rating || undefined,
      installs: extension.installs,
      permissions: extension.permissions.length > 0 ? extension.permissions : undefined,
      updatedAt: extension.updatedAt.toISOString(),
      isInstalled: extension.installedExtensions.length > 0,
      installedExtension: extension.installedExtensions[0]
        ? {
            enabled: extension.installedExtensions[0].enabled,
            needsConfiguration: extension.installedExtensions[0].needsConfiguration,
            configuration: extension.installedExtensions[0].configuration
              ? JSON.parse(extension.installedExtensions[0].configuration)
              : undefined,
          }
        : undefined,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error("Error fetching extension:", error);
    return NextResponse.json(
      { error: "Failed to fetch extension" },
      { status: 500 }
    );
  }
}


