-- CreateTable
CREATE TABLE "CommunityRecipeLike" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityRecipeLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityRecipeSave" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityRecipeSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionListing" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "authorName" TEXT NOT NULL,
    "authorUrl" TEXT,
    "pricing" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "permissions" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledExtension" (
    "id" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "needsConfiguration" BOOLEAN NOT NULL DEFAULT false,
    "configuration" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstalledExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scopes" TEXT[],
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "config" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiProviderSettings" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "apiKey" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'needs-key',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProviderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityRecipeLike_recipeId_idx" ON "CommunityRecipeLike"("recipeId");

-- CreateIndex
CREATE INDEX "CommunityRecipeLike_userId_idx" ON "CommunityRecipeLike"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityRecipeLike_recipeId_userId_key" ON "CommunityRecipeLike"("recipeId", "userId");

-- CreateIndex
CREATE INDEX "CommunityRecipeSave_recipeId_idx" ON "CommunityRecipeSave"("recipeId");

-- CreateIndex
CREATE INDEX "CommunityRecipeSave_userId_idx" ON "CommunityRecipeSave"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityRecipeSave_recipeId_userId_key" ON "CommunityRecipeSave"("recipeId", "userId");

-- CreateIndex
CREATE INDEX "ExtensionListing_category_idx" ON "ExtensionListing"("category");

-- CreateIndex
CREATE INDEX "ExtensionListing_enabled_idx" ON "ExtensionListing"("enabled");

-- CreateIndex
CREATE INDEX "InstalledExtension_householdId_idx" ON "InstalledExtension"("householdId");

-- CreateIndex
CREATE INDEX "InstalledExtension_extensionId_idx" ON "InstalledExtension"("extensionId");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledExtension_extensionId_householdId_key" ON "InstalledExtension"("extensionId", "householdId");

-- CreateIndex
CREATE INDEX "Integration_householdId_idx" ON "Integration"("householdId");

-- CreateIndex
CREATE INDEX "Integration_provider_idx" ON "Integration"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_householdId_provider_key" ON "Integration"("householdId", "provider");

-- CreateIndex
CREATE INDEX "AiProviderSettings_householdId_idx" ON "AiProviderSettings"("householdId");

-- CreateIndex
CREATE INDEX "AiProviderSettings_providerId_idx" ON "AiProviderSettings"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderSettings_householdId_providerId_key" ON "AiProviderSettings"("householdId", "providerId");

-- AddForeignKey
ALTER TABLE "CommunityRecipeLike" ADD CONSTRAINT "CommunityRecipeLike_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityRecipeLike" ADD CONSTRAINT "CommunityRecipeLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityRecipeSave" ADD CONSTRAINT "CommunityRecipeSave_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityRecipeSave" ADD CONSTRAINT "CommunityRecipeSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledExtension" ADD CONSTRAINT "InstalledExtension_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "ExtensionListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledExtension" ADD CONSTRAINT "InstalledExtension_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiProviderSettings" ADD CONSTRAINT "AiProviderSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "UserIngredientUnitPreference_userId_ingredientKey_lastUsedAt_id" RENAME TO "UserIngredientUnitPreference_userId_ingredientKey_lastUsedA_idx";
