import { prisma } from "../src/lib/prisma";
import { fetchOpenFoodFactsProduct } from "../src/lib/open-food-facts/client";
import { Prisma } from "../src/generated/prisma/client";

function parseFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const exact = process.argv.find((arg) => arg === `--${name}`);
  if (exact) return "true";
  const valueArg = process.argv.find((arg) => arg.startsWith(prefix));
  return valueArg ? valueArg.slice(prefix.length) : undefined;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const limitArg = parseFlag("limit");
  const dryRun = parseFlag("dry-run") === "true";
  const sleepArg = parseFlag("sleepMs");

  const limit = Number(limitArg || process.env.OPEN_FOOD_FACTS_BACKFILL_BATCH_SIZE || 50);
  const sleepMs = Number(sleepArg || 700);
  const ttlDays = Number(process.env.OPEN_FOOD_FACTS_CACHE_TTL_DAYS || 30);
  const ttlMs = (Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : 30) * 24 * 60 * 60 * 1000;

  const staleBefore = new Date(Date.now() - ttlMs);

  const candidates = await prisma.barcode.findMany({
    where: {
      manualLocked: false,
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
    },
    include: { foodItem: true },
    orderBy: [{ lastSyncedAt: "asc" }, { createdAt: "asc" }],
    take: Number.isFinite(limit) && limit > 0 ? limit : 50,
  });

  if (candidates.length === 0) {
    console.log("No barcodes require enrichment.");
    return;
  }

  console.log(`Processing ${candidates.length} barcode(s). dryRun=${dryRun}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const barcode of candidates) {
    try {
      const result = await fetchOpenFoodFactsProduct(barcode.code);

      if (!result.found || !result.payload) {
        skipped += 1;
        if (!dryRun) {
          await prisma.barcode.update({
            where: { id: barcode.id },
            data: { lastSyncedAt: new Date() },
          });
        }
        continue;
      }

      const payload = result.payload;
      const foodName = payload.name || barcode.foodItem.name || barcode.code;

      let foodItem = await prisma.foodItem.findFirst({
        where: { name: { equals: foodName, mode: "insensitive" } },
      });

      if (!foodItem && !dryRun) {
        foodItem = await prisma.foodItem.create({
          data: {
            name: foodName,
            canonicalName: payload.canonicalName || undefined,
          },
        });
      }

      if (foodItem && payload.canonicalName && !foodItem.canonicalName && !dryRun) {
        foodItem = await prisma.foodItem.update({
          where: { id: foodItem.id },
          data: { canonicalName: payload.canonicalName },
        });
      }

      if (!dryRun) {
        const nutritionPer100g =
          payload.nutritionPer100g !== undefined
            ? (payload.nutritionPer100g as Prisma.InputJsonValue)
            : Prisma.DbNull;

        await prisma.barcode.update({
          where: { id: barcode.id },
          data: {
            foodItemId: foodItem?.id || barcode.foodItemId,
            type: barcode.code.length === 12 ? "UPC" : "EAN",
            source: "OPEN_FOOD_FACTS",
            brand: payload.brand || null,
            categoriesTags: payload.categoriesTags,
            ingredientsText: payload.ingredientsText || null,
            allergensTags: payload.allergensTags,
            nutriscoreGrade: payload.nutriscoreGrade || null,
            novaGroup: payload.novaGroup ?? null,
            ecoscoreGrade: payload.ecoscoreGrade || null,
            imageFrontUrl: payload.imageFrontUrl || null,
            nutritionPer100g,
            attributionUrl: payload.attributionUrl,
            lastSyncedAt: new Date(),
          },
        });
      }

      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed barcode ${barcode.code}:`, error);
    }

    if (sleepMs > 0) {
      await delay(sleepMs);
    }
  }

  console.log(
    `Done. processed=${candidates.length} updated=${updated} skipped=${skipped} failed=${failed}`
  );
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
