import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDefaultPreferences } from "@/lib/preferences";

/**
 * POST /api/user/preferences/reset
 * Reset user preferences to defaults
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Delete existing preferences and create new defaults
    await prisma.userPreferences.deleteMany({
      where: { userId },
    });

    const preferences = await createDefaultPreferences(userId);

    return NextResponse.json({
      preferences: {
        id: preferences.id,
        measurementSystem: preferences.measurementSystem,
        defaultWeightUnit: preferences.defaultWeightUnit,
        defaultVolumeUnit: preferences.defaultVolumeUnit,
        timezone: preferences.timezone,
        dateFormat: preferences.dateFormat,
        createdAt: preferences.createdAt,
        updatedAt: preferences.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error resetting preferences:", error);
    return NextResponse.json(
      { error: "Failed to reset preferences" },
      { status: 500 }
    );
  }
}

