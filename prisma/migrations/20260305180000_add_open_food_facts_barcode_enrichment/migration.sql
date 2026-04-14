-- Add OFF enrichment/cache fields for barcode mappings
ALTER TABLE "Barcode"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'LOCAL_MANUAL',
ADD COLUMN "manualLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "brand" TEXT,
ADD COLUMN "categoriesTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "ingredientsText" TEXT,
ADD COLUMN "allergensTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "nutriscoreGrade" TEXT,
ADD COLUMN "novaGroup" INTEGER,
ADD COLUMN "ecoscoreGrade" TEXT,
ADD COLUMN "imageFrontUrl" TEXT,
ADD COLUMN "nutritionPer100g" JSONB,
ADD COLUMN "attributionUrl" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
