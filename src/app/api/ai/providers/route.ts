import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { prisma } from "@/lib/prisma";

// Available AI providers (could be moved to config/database)
const AVAILABLE_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    recommendedModel: "gpt-4o-mini",
    availableByok: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    recommendedModel: "claude-3-5-sonnet-20241022",
    availableByok: true,
  },
  {
    id: "google",
    name: "Google",
    recommendedModel: "gemini-1.5-pro",
    availableByok: true,
  },
];

// GET /api/ai/providers - List AI providers and settings
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

    // Get household's AI provider settings
    const settings = await prisma.aiProviderSettings.findMany({
      where: { householdId },
    });

    // Build providers list with status
    const providers = AVAILABLE_PROVIDERS.map((provider) => {
      const setting = settings.find((s: { providerId: string }) => s.providerId === provider.id);
      return {
        id: provider.id,
        name: provider.name,
        recommendedModel: provider.recommendedModel,
        availableByok: provider.availableByok,
        status: setting
          ? (setting.status as "ready" | "needs-key" | "error")
          : "needs-key",
        isActive: setting?.isActive || false,
        model: setting?.model || undefined,
      };
    });

    const activeProvider = settings.find((s: { isActive: boolean }) => s.isActive);

    return NextResponse.json({
      keyMode: "bring-your-own" as const,
      providers,
      activeProviderId: activeProvider?.providerId || undefined,
    });
  } catch (error) {
    console.error("Error fetching AI providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI providers" },
      { status: 500 }
    );
  }
}

