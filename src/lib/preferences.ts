import { prisma } from "./prisma";

// Export types for use in other modules
export type MeasurementSystem = "metric" | "imperial";
export type WeightUnit = "g" | "kg" | "oz" | "lb";
export type VolumeUnit = "ml" | "l" | "cup" | "tbsp" | "tsp";

export interface UserPreferencesData {
  measurementSystem: MeasurementSystem;
  defaultWeightUnit: WeightUnit;
  defaultVolumeUnit: VolumeUnit;
  timezone: string | null;
  dateFormat: string | null;
}

export interface UserPreferencesInput {
  measurementSystem?: MeasurementSystem;
  defaultWeightUnit?: WeightUnit;
  defaultVolumeUnit?: VolumeUnit;
  timezone?: string | null;
  dateFormat?: string | null;
}

/**
 * Create default user preferences
 * Throws an error if the user doesn't exist in the database
 */
export async function createDefaultPreferences(userId: string) {
  // First verify the user exists to provide a better error message
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`Cannot create preferences: user with id ${userId} does not exist`);
  }

  return await prisma.userPreferences.create({
    data: {
      userId,
      measurementSystem: "metric",
      defaultWeightUnit: "g",
      defaultVolumeUnit: "ml",
      dateFormat: "YYYY-MM-DD",
    },
  });
}

/**
 * Get user preferences, creating defaults if they don't exist
 */
export async function getOrCreateUserPreferences(userId: string) {
  let preferences = await prisma.userPreferences.findUnique({
    where: { userId },
  });

  if (!preferences) {
    preferences = await createDefaultPreferences(userId);
  }

  return preferences;
}

/**
 * Get user preferences with defaults (returns defaults if preferences don't exist)
 * This is useful for frontend components that need preference values
 */
export async function getUserPreferencesWithDefaults(userId: string) {
  const preferences = await prisma.userPreferences.findUnique({
    where: { userId },
  });

  if (preferences) {
    return {
      measurementSystem: preferences.measurementSystem as MeasurementSystem,
      defaultWeightUnit: preferences.defaultWeightUnit as WeightUnit,
      defaultVolumeUnit: preferences.defaultVolumeUnit as VolumeUnit,
      timezone: preferences.timezone,
      dateFormat: preferences.dateFormat || "YYYY-MM-DD",
    };
  }

  // Return defaults if preferences don't exist
  return {
    measurementSystem: "metric" as MeasurementSystem,
    defaultWeightUnit: "g" as WeightUnit,
    defaultVolumeUnit: "ml" as VolumeUnit,
    timezone: null,
    dateFormat: "YYYY-MM-DD",
  };
}

/**
 * Validate preference values
 */
export function validatePreferences(input: UserPreferencesInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (input.measurementSystem !== undefined) {
    if (!["metric", "imperial"].includes(input.measurementSystem)) {
      errors.push("measurementSystem must be 'metric' or 'imperial'");
    }
  }

  if (input.defaultWeightUnit !== undefined) {
    if (!["g", "kg", "oz", "lb"].includes(input.defaultWeightUnit)) {
      errors.push("defaultWeightUnit must be 'g', 'kg', 'oz', or 'lb'");
    }
  }

  if (input.defaultVolumeUnit !== undefined) {
    if (!["ml", "l", "cup", "tbsp", "tsp"].includes(input.defaultVolumeUnit)) {
      errors.push("defaultVolumeUnit must be 'ml', 'l', 'cup', 'tbsp', or 'tsp'");
    }
  }

  if (input.dateFormat !== undefined && input.dateFormat !== null) {
    if (typeof input.dateFormat !== "string" || input.dateFormat.length > 50) {
      errors.push("dateFormat must be a string with max 50 characters");
    }
  }

  if (input.timezone !== undefined && input.timezone !== null) {
    if (typeof input.timezone !== "string" || input.timezone.length > 100) {
      errors.push("timezone must be a string with max 100 characters");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

