import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  // ── Household ──────────────────────────────────────────────────────────
  households: defineTable({
    name: v.string(),
  }),

  householdMembers: defineTable({
    userId: v.id("users"),
    householdId: v.id("households"),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("member"),
    ),
  })
    .index("by_userId", ["userId"])
    .index("by_householdId", ["householdId"])
    .index("by_userId_and_householdId", ["userId", "householdId"]),

  // ── Food & Barcode ─────────────────────────────────────────────────────
  foodItems: defineTable({
    name: v.string(),
    canonicalName: v.optional(v.string()),
  }).index("by_name", ["name"]),

  barcodes: defineTable({
    foodItemId: v.id("foodItems"),
    code: v.string(),
    type: v.string(),
    source: v.string(), // "LOCAL_MANUAL" | "OPEN_FOOD_FACTS"
    manualLocked: v.boolean(),
    brand: v.optional(v.string()),
    categoriesTags: v.optional(v.array(v.string())),
    ingredientsText: v.optional(v.string()),
    allergensTags: v.optional(v.array(v.string())),
    nutriscoreGrade: v.optional(v.string()),
    novaGroup: v.optional(v.number()),
    ecoscoreGrade: v.optional(v.string()),
    imageFrontUrl: v.optional(v.string()),
    nutritionPer100g: v.optional(v.any()),
    attributionUrl: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_foodItemId", ["foodItemId"]),

  // ── Kitchen & Inventory ────────────────────────────────────────────────
  kitchenLocations: defineTable({
    householdId: v.id("households"),
    name: v.string(),
  }).index("by_householdId", ["householdId"]),

  inventoryItems: defineTable({
    householdId: v.id("households"),
    foodItemId: v.id("foodItems"),
    locationId: v.id("kitchenLocations"),
    quantity: v.number(),
    unit: v.string(),
    expiresOn: v.optional(v.string()),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    barcode: v.optional(v.string()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_locationId", ["locationId"])
    .index("by_foodItemId", ["foodItemId"])
    .index("by_householdId_and_expiresOn", ["householdId", "expiresOn"]),

  // ── Units ──────────────────────────────────────────────────────────────
  units: defineTable({
    slug: v.string(),
    name: v.string(),
    abbr: v.optional(v.string()),
    unitType: v.string(), // "count" | "volume" | "mass" | etc.
    system: v.string(), // "us" | "metric" | "neutral"
    baseUnitId: v.optional(v.id("units")),
    toBaseFactor: v.optional(v.number()),
    isCommon: v.boolean(),
    isEnabled: v.boolean(),
  })
    .index("by_slug", ["slug"])
    .index("by_name", ["name"])
    .index("by_unitType_and_isCommon_and_isEnabled", [
      "unitType",
      "isCommon",
      "isEnabled",
    ]),

  unitAliases: defineTable({
    unitId: v.id("units"),
    alias: v.string(),
    priority: v.number(),
  })
    .index("by_unitId", ["unitId"])
    .index("by_alias", ["alias"])
    .index("by_unitId_and_alias", ["unitId", "alias"]),

  ingredientUnitProfiles: defineTable({
    ingredientKey: v.string(),
    defaultUnitId: v.optional(v.id("units")),
  }).index("by_ingredientKey", ["ingredientKey"]),

  ingredientUnitProfileRecommendations: defineTable({
    profileId: v.id("ingredientUnitProfiles"),
    unitId: v.id("units"),
    rank: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_profileId_and_unitId", ["profileId", "unitId"])
    .index("by_profileId_and_rank", ["profileId", "rank"]),

  // ── Recipes ────────────────────────────────────────────────────────────
  recipes: defineTable({
    householdId: v.id("households"),
    title: v.string(),
    description: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    visibility: v.string(), // "private" | "household" | "public" | "unlisted"
    servings: v.optional(v.number()),
    totalTimeMinutes: v.optional(v.number()),
    caloriesKcal: v.optional(v.number()),
    proteinGrams: v.optional(v.number()),
    carbsGrams: v.optional(v.number()),
    fatGrams: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    favorited: v.boolean(),
    lastCookedAt: v.optional(v.number()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_visibility", ["visibility"]),

  recipeIngredients: defineTable({
    recipeId: v.id("recipes"),
    foodItemId: v.optional(v.id("foodItems")),
    name: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    note: v.optional(v.string()),
    order: v.number(),
  })
    .index("by_recipeId", ["recipeId"])
    .index("by_foodItemId", ["foodItemId"]),

  recipeSteps: defineTable({
    recipeId: v.id("recipes"),
    text: v.string(),
    order: v.number(),
  }).index("by_recipeId", ["recipeId"]),

  // ── Shopping List ──────────────────────────────────────────────────────
  shoppingLists: defineTable({
    householdId: v.id("households"),
  }).index("by_householdId", ["householdId"]),

  shoppingListItems: defineTable({
    shoppingListId: v.id("shoppingLists"),
    foodItemId: v.optional(v.id("foodItems")),
    name: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
    checked: v.boolean(),
    note: v.optional(v.string()),
    source: v.optional(v.string()), // "manual" | "from-recipe" | "low-stock"
    recipeId: v.optional(v.id("recipes")),
  })
    .index("by_shoppingListId", ["shoppingListId"])
    .index("by_foodItemId", ["foodItemId"]),

  // ── Community ──────────────────────────────────────────────────────────
  communityRecipeLikes: defineTable({
    recipeId: v.id("recipes"),
    userId: v.id("users"),
  })
    .index("by_recipeId", ["recipeId"])
    .index("by_userId", ["userId"])
    .index("by_recipeId_and_userId", ["recipeId", "userId"]),

  communityRecipeSaves: defineTable({
    recipeId: v.id("recipes"),
    userId: v.id("users"),
  })
    .index("by_recipeId", ["recipeId"])
    .index("by_userId", ["userId"])
    .index("by_recipeId_and_userId", ["recipeId", "userId"]),

  // ── Extensions ─────────────────────────────────────────────────────────
  extensionListings: defineTable({
    name: v.string(),
    description: v.string(),
    category: v.string(),
    tags: v.optional(v.array(v.string())),
    authorName: v.string(),
    authorUrl: v.optional(v.string()),
    pricing: v.string(), // "free" | "paid" | "trial"
    rating: v.optional(v.number()),
    installs: v.number(),
    permissions: v.optional(v.array(v.string())),
    enabled: v.boolean(),
  })
    .index("by_category", ["category"])
    .index("by_enabled", ["enabled"]),

  installedExtensions: defineTable({
    extensionId: v.id("extensionListings"),
    householdId: v.id("households"),
    enabled: v.boolean(),
    needsConfiguration: v.boolean(),
    configuration: v.optional(v.string()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_extensionId", ["extensionId"])
    .index("by_extensionId_and_householdId", ["extensionId", "householdId"]),

  // ── Integrations ───────────────────────────────────────────────────────
  integrations: defineTable({
    householdId: v.id("households"),
    provider: v.string(),
    name: v.string(),
    description: v.string(),
    status: v.string(), // "connected" | "disconnected" | "error"
    scopes: v.optional(v.array(v.string())),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    config: v.optional(v.string()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_provider", ["provider"])
    .index("by_householdId_and_provider", ["householdId", "provider"]),

  // ── AI Provider Settings ───────────────────────────────────────────────
  aiProviderSettings: defineTable({
    householdId: v.id("households"),
    providerId: v.string(),
    providerName: v.string(),
    apiKey: v.optional(v.string()),
    model: v.optional(v.string()),
    status: v.string(), // "ready" | "needs-key" | "error"
    isActive: v.boolean(),
    lastTestedAt: v.optional(v.number()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_providerId", ["providerId"])
    .index("by_householdId_and_providerId", ["householdId", "providerId"]),

  // ── User Preferences ──────────────────────────────────────────────────
  userPreferences: defineTable({
    userId: v.id("users"),
    measurementSystem: v.string(), // "metric" | "imperial"
    defaultWeightUnit: v.string(),
    defaultVolumeUnit: v.string(),
    timezone: v.optional(v.string()),
    dateFormat: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  // ── User Unit Usage ───────────────────────────────────────────────────
  userUnitUsage: defineTable({
    userId: v.id("users"),
    unitId: v.id("units"),
    count: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_userId_and_unitId", ["userId", "unitId"])
    .index("by_userId_and_lastUsedAt", ["userId", "lastUsedAt"]),

  userIngredientUnitPreferences: defineTable({
    userId: v.id("users"),
    ingredientKey: v.string(),
    unitId: v.id("units"),
    count: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_userId_and_ingredientKey_and_unitId", [
      "userId",
      "ingredientKey",
      "unitId",
    ])
    .index("by_userId_and_ingredientKey_and_lastUsedAt", [
      "userId",
      "ingredientKey",
      "lastUsedAt",
    ]),

  // ── Media Assets ──────────────────────────────────────────────────────
  mediaAssets: defineTable({
    url: v.string(),
    recipeId: v.optional(v.id("recipes")),
    inventoryItemId: v.optional(v.id("inventoryItems")),
  })
    .index("by_recipeId", ["recipeId"])
    .index("by_inventoryItemId", ["inventoryItemId"]),

  // ── Admin Users ────────────────────────────────────────────────────────
  appAdmins: defineTable({
    userId: v.id("users"),
  }).index("by_userId", ["userId"]),

  // ── Auth Rate Limiting ────────────────────────────────────────────────
  authRateLimitEvents: defineTable({
    scope: v.string(),
    subjectHash: v.string(),
    ipHash: v.string(),
    windowStart: v.number(),
    count: v.number(),
  })
    .index("by_scope", ["scope"])
    .index("by_windowStart", ["windowStart"])
    .index("by_scope_and_subjectHash_and_ipHash_and_windowStart", [
      "scope",
      "subjectHash",
      "ipHash",
      "windowStart",
    ]),
});
