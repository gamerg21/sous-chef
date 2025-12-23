import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// GET /api/extensions - Browse extensions
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    // Build where clause
    const where: {
      enabled: boolean;
      category?: { equals: string };
      name?: { contains: string; mode: "insensitive" };
      OR?: Array<{
        name?: { contains: string; mode: "insensitive" };
        description?: { contains: string; mode: "insensitive" };
        tags?: { has: string };
      }>;
    } = {
      enabled: true,
    };

    if (category) {
      where.category = { equals: category };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { tags: { has: search } },
      ];
    }

    const extensions = await prisma.extensionListing.findMany({
      where,
      include: {
        installedExtensions: {
          where: {
            householdId,
          },
        },
      },
      orderBy: {
        installs: "desc",
      },
    });

    // Transform to match component interface
    const transformed = extensions.map((ext: {
      id: string;
      name: string;
      description: string;
      category: string;
      tags: string[];
      authorName: string;
      authorUrl: string | null;
      pricing: string;
      rating: number | null;
      installs: number;
      permissions: string[];
      updatedAt: Date;
      installedExtensions: Array<{ enabled: boolean; needsConfiguration: boolean }>;
    }) => ({
      id: ext.id,
      name: ext.name,
      description: ext.description,
      category: ext.category,
      tags: ext.tags.length > 0 ? ext.tags : undefined,
      author: {
        name: ext.authorName,
        verified: false, // Could be added to schema later
        url: ext.authorUrl || undefined,
      },
      pricing: ext.pricing as "free" | "paid" | "trial",
      rating: ext.rating || undefined,
      installs: ext.installs,
      permissions: ext.permissions.length > 0 ? ext.permissions : undefined,
      updatedAt: ext.updatedAt.toISOString(),
      isInstalled: ext.installedExtensions.length > 0,
      installedExtension: ext.installedExtensions[0]
        ? {
            enabled: ext.installedExtensions[0].enabled,
            needsConfiguration: ext.installedExtensions[0].needsConfiguration,
          }
        : undefined,
    }));

    return NextResponse.json({ extensions: transformed });
  } catch (error) {
    console.error("Error fetching extensions:", error);
    return NextResponse.json(
      { error: "Failed to fetch extensions" },
      { status: 500 }
    );
  }
}


