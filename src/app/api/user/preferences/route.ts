import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateUserPreferences,
  validatePreferences,
  type UserPreferencesInput,
} from "@/lib/preferences";

/**
 * GET /api/user/preferences
 * Get current user's preferences
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const preferences = await getOrCreateUserPreferences(session.user.id);

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
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/preferences
 * Update current user's preferences
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input: UserPreferencesInput = {
      measurementSystem: body.measurementSystem,
      defaultWeightUnit: body.defaultWeightUnit,
      defaultVolumeUnit: body.defaultVolumeUnit,
      timezone: body.timezone,
      dateFormat: body.dateFormat,
    };

    // Validate input
    const validation = validatePreferences(input);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", errors: validation.errors },
        { status: 400 }
      );
    }

    // Build update data (only include defined fields)
    const updateData: Partial<UserPreferencesInput> = {};
    if (input.measurementSystem !== undefined) {
      updateData.measurementSystem = input.measurementSystem;
    }
    if (input.defaultWeightUnit !== undefined) {
      updateData.defaultWeightUnit = input.defaultWeightUnit;
    }
    if (input.defaultVolumeUnit !== undefined) {
      updateData.defaultVolumeUnit = input.defaultVolumeUnit;
    }
    if (input.timezone !== undefined) {
      updateData.timezone = input.timezone;
    }
    if (input.dateFormat !== undefined) {
      updateData.dateFormat = input.dateFormat;
    }

    // Ensure preferences exist
    await getOrCreateUserPreferences(session.user.id);

    // Update preferences
    const updated = await prisma.userPreferences.update({
      where: { userId: session.user.id },
      data: updateData,
    });

    return NextResponse.json({
      preferences: {
        id: updated.id,
        measurementSystem: updated.measurementSystem,
        defaultWeightUnit: updated.defaultWeightUnit,
        defaultVolumeUnit: updated.defaultVolumeUnit,
        timezone: updated.timezone,
        dateFormat: updated.dateFormat,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}

