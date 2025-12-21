import { prisma } from "./prisma";

export type KitchenLocationId = 'pantry' | 'fridge' | 'freezer';

const DEFAULT_LOCATIONS: Array<{ id: KitchenLocationId; name: string }> = [
  { id: 'pantry', name: 'Pantry' },
  { id: 'fridge', name: 'Fridge' },
  { id: 'freezer', name: 'Freezer' },
];

/**
 * Maps location name to expected location ID
 */
function nameToLocationId(name: string): KitchenLocationId {
  const normalized = name.toLowerCase().trim();
  if (normalized.includes('pantry')) return 'pantry';
  if (normalized.includes('fridge')) return 'fridge';
  if (normalized.includes('freezer')) return 'freezer';
  return 'pantry'; // default fallback
}

/**
 * Ensures that default kitchen locations exist for a household.
 * Creates them if they don't exist. Prevents duplicates.
 */
export async function ensureKitchenLocations(householdId: string) {
  const existingLocations = await prisma.kitchenLocation.findMany({
    where: { householdId },
  });

  // Check by exact name match (case-insensitive)
  const existingNames = new Set(existingLocations.map((loc) => loc.name.toLowerCase().trim()));
  const toCreate = DEFAULT_LOCATIONS.filter((loc) => !existingNames.has(loc.name.toLowerCase()));

  if (toCreate.length > 0) {
    await prisma.kitchenLocation.createMany({
      data: toCreate.map((loc) => ({
        householdId,
        name: loc.name,
      })),
      skipDuplicates: true,
    });
  }

  // Return all locations for this household
  return prisma.kitchenLocation.findMany({
    where: { householdId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Gets unique kitchen locations for a household, ensuring only one per type.
 * This prevents duplicate location IDs in the UI.
 */
export async function getUniqueKitchenLocations(householdId: string): Promise<Array<{ id: KitchenLocationId; name: string }>> {
  await ensureKitchenLocations(householdId);
  
  const locations = await prisma.kitchenLocation.findMany({
    where: { householdId },
    orderBy: { name: 'asc' },
  });

  // Deduplicate by transformed ID (only keep first occurrence of each type)
  const locationMap = new Map<KitchenLocationId, { id: KitchenLocationId; name: string }>();
  locations.forEach((loc) => {
    const transformed = transformLocation(loc);
    if (!locationMap.has(transformed.id)) {
      locationMap.set(transformed.id, transformed);
    }
  });

  return Array.from(locationMap.values());
}

/**
 * Transforms database location to component-expected format
 */
export function transformLocation(location: { id: string; name: string }): { id: KitchenLocationId; name: string } {
  return {
    id: nameToLocationId(location.name),
    name: location.name,
  };
}

