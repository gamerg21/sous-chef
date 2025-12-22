import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const configureProviderSchema = z.object({
  apiKey: z.string().optional(),
  model: z.string().optional(),
  isActive: z.boolean().optional(),
});

// POST /api/ai/providers/[id] - Configure AI provider
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
    const validated = configureProviderSchema.parse(body);

    // Provider names mapping
    const providerNames: Record<string, string> = {
      openai: "OpenAI",
      anthropic: "Anthropic",
      google: "Google",
    };

    const providerName = providerNames[id] || id;

    // Check if setting exists
    const existing = await prisma.aiProviderSettings.findUnique({
      where: {
        householdId_providerId: {
          householdId,
          providerId: id,
        },
      },
    });

    let setting;
    if (existing) {
      // Update existing setting
      const updateData: {
        apiKey?: string;
        status?: string;
        model?: string;
      } = {};
      if (validated.apiKey !== undefined) {
        updateData.apiKey = validated.apiKey;
        updateData.status = validated.apiKey ? "ready" : "needs-key";
      }
      if (validated.model !== undefined) {
        updateData.model = validated.model;
      }
      if (validated.isActive !== undefined) {
        updateData.isActive = validated.isActive;
        // If setting as active, deactivate others
        if (validated.isActive) {
          await prisma.aiProviderSettings.updateMany({
            where: {
              householdId,
              isActive: true,
            },
            data: {
              isActive: false,
            },
          });
        }
      }

      setting = await prisma.aiProviderSettings.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      // Create new setting
      if (validated.isActive) {
        // Deactivate others first
        await prisma.aiProviderSettings.updateMany({
          where: {
            householdId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });
      }

      setting = await prisma.aiProviderSettings.create({
        data: {
          householdId,
          providerId: id,
          providerName,
          apiKey: validated.apiKey || null,
          model: validated.model || null,
          status: validated.apiKey ? "ready" : "needs-key",
          isActive: validated.isActive || false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      provider: {
        id: setting.providerId,
        name: setting.providerName,
        status: setting.status as "ready" | "needs-key" | "error",
        isActive: setting.isActive,
        model: setting.model || undefined,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error configuring AI provider:", error);
    return NextResponse.json(
      { error: "Failed to configure AI provider" },
      { status: 500 }
    );
  }
}

