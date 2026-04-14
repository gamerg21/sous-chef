-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('count', 'volume', 'mass', 'length', 'time', 'temperature', 'package', 'qualitative');

-- CreateEnum
CREATE TYPE "UnitSystem" AS ENUM ('us', 'metric', 'neutral');

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbr" TEXT,
    "unitType" "UnitType" NOT NULL,
    "system" "UnitSystem" NOT NULL DEFAULT 'neutral',
    "baseUnitId" TEXT,
    "toBaseFactor" DOUBLE PRECISION,
    "isCommon" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitAlias" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientUnitProfile" (
    "id" TEXT NOT NULL,
    "ingredientKey" TEXT NOT NULL,
    "defaultUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngredientUnitProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientUnitProfileRecommendation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IngredientUnitProfileRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUnitUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUnitUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIngredientUnitPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ingredientKey" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserIngredientUnitPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_slug_key" ON "Unit"("slug");

-- CreateIndex
CREATE INDEX "Unit_unitType_isCommon_isEnabled_idx" ON "Unit"("unitType", "isCommon", "isEnabled");

-- CreateIndex
CREATE INDEX "Unit_name_idx" ON "Unit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitAlias_unitId_alias_key" ON "UnitAlias"("unitId", "alias");

-- CreateIndex
CREATE INDEX "UnitAlias_alias_idx" ON "UnitAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientUnitProfile_ingredientKey_key" ON "IngredientUnitProfile"("ingredientKey");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientUnitProfileRecommendation_profileId_unitId_key" ON "IngredientUnitProfileRecommendation"("profileId", "unitId");

-- CreateIndex
CREATE INDEX "IngredientUnitProfileRecommendation_profileId_rank_idx" ON "IngredientUnitProfileRecommendation"("profileId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "UserUnitUsage_userId_unitId_key" ON "UserUnitUsage"("userId", "unitId");

-- CreateIndex
CREATE INDEX "UserUnitUsage_userId_lastUsedAt_idx" ON "UserUnitUsage"("userId", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserIngredientUnitPreference_userId_ingredientKey_unitId_key" ON "UserIngredientUnitPreference"("userId", "ingredientKey", "unitId");

-- CreateIndex
CREATE INDEX "UserIngredientUnitPreference_userId_ingredientKey_lastUsedAt_idx" ON "UserIngredientUnitPreference"("userId", "ingredientKey", "lastUsedAt");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitAlias" ADD CONSTRAINT "UnitAlias_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientUnitProfile" ADD CONSTRAINT "IngredientUnitProfile_defaultUnitId_fkey" FOREIGN KEY ("defaultUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientUnitProfileRecommendation" ADD CONSTRAINT "IngredientUnitProfileRecommendation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IngredientUnitProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientUnitProfileRecommendation" ADD CONSTRAINT "IngredientUnitProfileRecommendation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnitUsage" ADD CONSTRAINT "UserUnitUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnitUsage" ADD CONSTRAINT "UserUnitUsage_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIngredientUnitPreference" ADD CONSTRAINT "UserIngredientUnitPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIngredientUnitPreference" ADD CONSTRAINT "UserIngredientUnitPreference_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
