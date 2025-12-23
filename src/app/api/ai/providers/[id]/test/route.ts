import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// POST /api/ai/providers/[id]/test - Test AI provider connection
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
    const apiKey = body.apiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    // Test the API key by making a simple request
    // This is a placeholder - actual implementation would call the provider's API
    let testResult = { success: false, error: "" };

    try {
      // For now, we'll just validate the key format
      // In production, you'd make an actual API call to test
      if (id === "openai" && apiKey.startsWith("sk-")) {
        testResult = { success: true, error: "" };
      } else if (id === "anthropic" && apiKey.startsWith("sk-ant-")) {
        testResult = { success: true, error: "" };
      } else if (id === "google" && apiKey.length > 0) {
        testResult = { success: true, error: "" };
      } else {
        testResult = {
          success: false,
          error: "Invalid API key format for this provider",
        };
      }
    } catch (error: unknown) {
      testResult = {
        success: false,
        error: error instanceof Error ? error.message : "Failed to test connection",
      };
    }

    // Update the setting with test result
    const existing = await prisma.aiProviderSettings.findUnique({
      where: {
        householdId_providerId: {
          householdId,
          providerId: id,
        },
      },
    });

    if (existing) {
      await prisma.aiProviderSettings.update({
        where: { id: existing.id },
        data: {
          status: testResult.success ? "ready" : "error",
          lastTestedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: testResult.success,
      error: testResult.error || undefined,
    });
  } catch (error) {
    console.error("Error testing AI provider:", error);
    return NextResponse.json(
      { error: "Failed to test AI provider" },
      { status: 500 }
    );
  }
}


