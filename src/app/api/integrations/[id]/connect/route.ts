import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const connectIntegrationSchema = z.object({
  provider: z.string(),
  name: z.string(),
  description: z.string(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  config: z.record(z.string(), z.any()).optional(),
});

// POST /api/integrations/[id]/connect - Connect an integration
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
    const validated = connectIntegrationSchema.parse(body);

    // Check if integration already exists
    const existing = await prisma.integration.findUnique({
      where: {
        householdId_provider: {
          householdId,
          provider: validated.provider,
        },
      },
    });

    let integration;
    if (existing) {
      // Update existing integration
      integration = await prisma.integration.update({
        where: { id: existing.id },
        data: {
          name: validated.name,
          description: validated.description,
          status: "connected",
          accessToken: validated.accessToken || existing.accessToken,
          refreshToken: validated.refreshToken || existing.refreshToken,
          scopes: validated.scopes || existing.scopes,
          config: validated.config ? JSON.stringify(validated.config) : existing.config,
          lastSyncAt: new Date(),
        },
      });
    } else {
      // Create new integration
      integration = await prisma.integration.create({
        data: {
          householdId,
          provider: validated.provider,
          name: validated.name,
          description: validated.description,
          status: "connected",
          accessToken: validated.accessToken || null,
          refreshToken: validated.refreshToken || null,
          scopes: validated.scopes || [],
          config: validated.config ? JSON.stringify(validated.config) : null,
          lastSyncAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      integration: {
        id: integration.id,
        name: integration.name,
        description: integration.description,
        status: integration.status as "connected" | "disconnected" | "error",
        scopes: integration.scopes.length > 0 ? integration.scopes : undefined,
        lastSyncAt: integration.lastSyncAt?.toISOString() || undefined,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error connecting integration:", error);
    return NextResponse.json(
      { error: "Failed to connect integration" },
      { status: 500 }
    );
  }
}

