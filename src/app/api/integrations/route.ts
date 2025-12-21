import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// GET /api/integrations - List integrations for household
export async function GET(request: NextRequest) {
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

    const integrations = await prisma.integration.findMany({
      where: { householdId },
      orderBy: { name: "asc" },
    });

    // Transform to match component interface
    const transformed = integrations.map((integration) => ({
      id: integration.id,
      name: integration.name,
      description: integration.description,
      status: integration.status as "connected" | "disconnected" | "error",
      scopes: integration.scopes.length > 0 ? integration.scopes : undefined,
      lastSyncAt: integration.lastSyncAt?.toISOString() || undefined,
    }));

    return NextResponse.json({ integrations: transformed });
  } catch (error) {
    console.error("Error fetching integrations:", error);
    return NextResponse.json(
      { error: "Failed to fetch integrations" },
      { status: 500 }
    );
  }
}

