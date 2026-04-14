#!/usr/bin/env tsx
/**
 * Demo mode seed script for Sous Chef
 *
 * Creates a complete demo environment with:
 * - Demo user account
 * - Demo household
 * - Kitchen locations (pantry, fridge, freezer)
 * - Realistic inventory items
 * - Sample recipes with ingredients and steps
 * - Shopping list items
 *
 * Usage:
 *   npm run seed:demo
 *   or
 *   tsx scripts/seed-demo.ts
 */

// Load environment variables from .env file FIRST, before any imports
import { config } from "dotenv";
config();

// Check if DATABASE_URL is set before importing Prisma
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is not set.");
  console.error("   Please ensure your .env file contains DATABASE_URL.");
  process.exit(1);
}

import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Create Prisma client with adapter for this script
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({
  adapter: adapter,
  log: ["error"],
});

const DEMO_USER_EMAIL = "demo@souschef.app";
const DEMO_USER_PASSWORD = "demo1234";
const DEMO_USER_NAME = "Demo User";
const DEMO_HOUSEHOLD_NAME = "Demo Kitchen";

interface InventoryItemData {
  name: string;
  quantity: number;
  unit: string;
  location: string;
  expiresOn?: Date;
  category?: string;
}

interface RecipeData {
  title: string;
  description: string;
  servings?: number;
  totalTimeMinutes?: number;
  ingredients: Array<{
    name: string;
    quantity?: number;
    unit?: string;
  }>;
  steps: string[];
}

const inventoryItems: InventoryItemData[] = [
  // Pantry
  { name: "All-purpose flour", quantity: 2, unit: "kg", location: "Pantry", category: "Baking" },
  { name: "Pasta - Spaghetti", quantity: 500, unit: "g", location: "Pantry", category: "Grains" },
  { name: "Olive oil", quantity: 500, unit: "ml", location: "Pantry", category: "Oils" },
  { name: "Canned tomatoes", quantity: 3, unit: "cans", location: "Pantry", category: "Canned Goods" },
  { name: "Garlic", quantity: 1, unit: "bulb", location: "Pantry", category: "Vegetables" },
  { name: "Onion", quantity: 4, unit: "count", location: "Pantry", category: "Vegetables" },
  { name: "Salt", quantity: 500, unit: "g", location: "Pantry", category: "Seasonings" },
  { name: "Black pepper", quantity: 50, unit: "g", location: "Pantry", category: "Seasonings" },
  { name: "Sugar", quantity: 750, unit: "g", location: "Pantry", category: "Baking" },
  { name: "Baking powder", quantity: 200, unit: "g", location: "Pantry", category: "Baking" },

  // Fridge
  {
    name: "Eggs",
    quantity: 12,
    unit: "count",
    location: "Fridge",
    category: "Dairy",
    expiresOn: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
  },
  {
    name: "Milk",
    quantity: 1,
    unit: "liter",
    location: "Fridge",
    category: "Dairy",
    expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  },
  {
    name: "Butter",
    quantity: 250,
    unit: "g",
    location: "Fridge",
    category: "Dairy",
    expiresOn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
  {
    name: "Chicken breast",
    quantity: 800,
    unit: "g",
    location: "Fridge",
    category: "Protein",
    expiresOn: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
  },
  {
    name: "Leafy greens",
    quantity: 200,
    unit: "g",
    location: "Fridge",
    category: "Vegetables",
    expiresOn: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  },
  {
    name: "Tomato",
    quantity: 3,
    unit: "count",
    location: "Fridge",
    category: "Vegetables",
    expiresOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  },
  {
    name: "Bell pepper",
    quantity: 2,
    unit: "count",
    location: "Fridge",
    category: "Vegetables",
    expiresOn: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  },

  // Freezer
  {
    name: "Ground beef",
    quantity: 500,
    unit: "g",
    location: "Freezer",
    category: "Protein",
    expiresOn: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
  },
  {
    name: "Frozen vegetables mix",
    quantity: 400,
    unit: "g",
    location: "Freezer",
    category: "Vegetables",
    expiresOn: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  },
  {
    name: "Ice cream",
    quantity: 500,
    unit: "ml",
    location: "Freezer",
    category: "Desserts",
    expiresOn: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
  },
];

const recipes: RecipeData[] = [
  {
    title: "Pasta Carbonara",
    description: "Classic Italian pasta carbonara with eggs, cheese, and pancetta",
    servings: 4,
    totalTimeMinutes: 20,
    ingredients: [
      { name: "Spaghetti", quantity: 400, unit: "g" },
      { name: "Eggs", quantity: 3, unit: "count" },
      { name: "Pancetta or bacon", quantity: 200, unit: "g" },
      { name: "Parmesan cheese", quantity: 100, unit: "g" },
      { name: "Black pepper", quantity: 1, unit: "tsp" },
      { name: "Salt", quantity: 1, unit: "tsp" },
    ],
    steps: [
      "Bring a pot of salted water to boil and cook spaghetti according to package directions.",
      "While pasta cooks, cut pancetta into small pieces and fry until crispy.",
      "In a bowl, whisk together eggs, grated Parmesan, and black pepper.",
      "Drain pasta, reserving 1 cup of pasta water.",
      "Add hot pasta to pancetta pan, then add egg mixture off heat and toss quickly.",
      "Add pasta water as needed to create a creamy sauce.",
      "Serve immediately with extra Parmesan.",
    ],
  },
  {
    title: "Chicken Stir Fry",
    description: "Quick and delicious Asian-inspired chicken stir fry",
    servings: 4,
    totalTimeMinutes: 25,
    ingredients: [
      { name: "Chicken breast", quantity: 600, unit: "g" },
      { name: "Bell pepper", quantity: 2, unit: "count" },
      { name: "Onion", quantity: 1, unit: "count" },
      { name: "Garlic", quantity: 3, unit: "cloves" },
      { name: "Soy sauce", quantity: 3, unit: "tbsp" },
      { name: "Olive oil", quantity: 2, unit: "tbsp" },
      { name: "Salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Cut chicken breast into bite-sized pieces.",
      "Chop bell peppers and onion into chunks.",
      "Mince garlic cloves.",
      "Heat oil in a large skillet or wok over high heat.",
      "Add chicken and cook until golden, about 5-7 minutes.",
      "Add vegetables and garlic, stir fry for 5 minutes.",
      "Add soy sauce and salt, toss everything together.",
      "Cook for another 2-3 minutes and serve hot.",
    ],
  },
  {
    title: "Greek Salad",
    description: "Fresh and crisp Mediterranean salad with feta cheese",
    servings: 4,
    totalTimeMinutes: 10,
    ingredients: [
      { name: "Leafy greens", quantity: 300, unit: "g" },
      { name: "Tomato", quantity: 3, unit: "count" },
      { name: "Cucumber", quantity: 1, unit: "count" },
      { name: "Feta cheese", quantity: 200, unit: "g" },
      { name: "Olive oil", quantity: 3, unit: "tbsp" },
      { name: "Lemon", quantity: 1, unit: "count" },
      { name: "Salt", quantity: 0.5, unit: "tsp" },
    ],
    steps: [
      "Wash and chop leafy greens into bite-sized pieces.",
      "Cut tomatoes and cucumber into chunks.",
      "Place greens in a large bowl.",
      "Add tomatoes and cucumber.",
      "Crumble feta cheese over the top.",
      "In a small bowl, whisk together olive oil, lemon juice, and salt.",
      "Drizzle dressing over salad and toss gently before serving.",
    ],
  },
  {
    title: "Banana Bread",
    description: "Moist and delicious classic banana bread",
    servings: 8,
    totalTimeMinutes: 60,
    ingredients: [
      { name: "Banana", quantity: 3, unit: "count" },
      { name: "All-purpose flour", quantity: 2, unit: "cups" },
      { name: "Sugar", quantity: 0.75, unit: "cup" },
      { name: "Eggs", quantity: 2, unit: "count" },
      { name: "Butter", quantity: 0.33, unit: "cup" },
      { name: "Baking powder", quantity: 1, unit: "tsp" },
      { name: "Salt", quantity: 0.25, unit: "tsp" },
    ],
    steps: [
      "Preheat oven to 350°F (175°C).",
      "Mash bananas in a large bowl.",
      "Cream together butter and sugar.",
      "Add eggs to butter mixture and beat well.",
      "Stir in mashed bananas.",
      "In a separate bowl, mix flour, baking powder, and salt.",
      "Fold dry ingredients into wet ingredients until just combined.",
      "Pour into a greased loaf pan.",
      "Bake for 45-50 minutes until a toothpick comes out clean.",
      "Cool in pan for 10 minutes, then turn out onto a rack.",
    ],
  },
  {
    title: "Tomato Soup",
    description: "Comforting and creamy tomato soup",
    servings: 4,
    totalTimeMinutes: 30,
    ingredients: [
      { name: "Canned tomatoes", quantity: 2, unit: "cans" },
      { name: "Onion", quantity: 1, unit: "count" },
      { name: "Garlic", quantity: 2, unit: "cloves" },
      { name: "Olive oil", quantity: 2, unit: "tbsp" },
      { name: "Milk", quantity: 1, unit: "cup" },
      { name: "Salt", quantity: 0.5, unit: "tsp" },
      { name: "Black pepper", quantity: 0.25, unit: "tsp" },
    ],
    steps: [
      "Heat olive oil in a pot over medium heat.",
      "Chop onion and garlic, add to pot and sauté until soft.",
      "Add canned tomatoes with their juice.",
      "Simmer for 15 minutes.",
      "Blend soup until smooth using an immersion blender.",
      "Stir in milk and season with salt and pepper.",
      "Simmer for 5 more minutes and serve hot.",
    ],
  },
  {
    title: "Simple Rice Bowl",
    description: "Easy and versatile rice bowl with vegetables and protein",
    servings: 2,
    totalTimeMinutes: 30,
    ingredients: [
      { name: "Rice", quantity: 1, unit: "cup" },
      { name: "Chicken breast", quantity: 300, unit: "g" },
      { name: "Onion", quantity: 1, unit: "count" },
      { name: "Bell pepper", quantity: 1, unit: "count" },
      { name: "Garlic", quantity: 2, unit: "cloves" },
      { name: "Soy sauce", quantity: 2, unit: "tbsp" },
      { name: "Olive oil", quantity: 1, unit: "tbsp" },
    ],
    steps: [
      "Cook rice according to package directions.",
      "Cut chicken into small pieces.",
      "Chop onion, bell pepper, and garlic.",
      "Heat oil in a skillet and cook chicken until done.",
      "Add vegetables to skillet and stir fry for 5-7 minutes.",
      "Add soy sauce and toss everything together.",
      "Serve chicken and vegetables over cooked rice.",
    ],
  },
];

const shoppingListItems = [
  { name: "Salmon", quantity: 600, unit: "g", category: "Protein" },
  { name: "Broccoli", quantity: 400, unit: "g", category: "Vegetables" },
  { name: "White wine", quantity: 750, unit: "ml", category: "Beverages" },
  { name: "Parmesan cheese", quantity: 200, unit: "g", category: "Dairy" },
  { name: "Fresh basil", quantity: 50, unit: "g", category: "Herbs" },
  { name: "Lemon", quantity: 3, unit: "count", category: "Produce" },
];

async function seedDemo() {
  try {
    console.log("🌱 Starting demo seed...\n");

    // 1. Check if demo user exists and delete if so
    console.log("📝 Setting up demo user...");
    let demoUser = await prisma.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });

    if (demoUser) {
      console.log(`   Found existing demo user, deleting...`);
      await prisma.user.delete({
        where: { email: DEMO_USER_EMAIL },
      });
    }

    // 2. Create demo user
    const hashedPassword = await bcrypt.hash(DEMO_USER_PASSWORD, 10);
    demoUser = await prisma.user.create({
      data: {
        email: DEMO_USER_EMAIL,
        name: DEMO_USER_NAME,
        password: hashedPassword,
      },
    });
    console.log(`✅ Created demo user: ${DEMO_USER_EMAIL}`);
    console.log(`   User ID: ${demoUser.id}`);

    // 3. Create demo household
    console.log("\n🏠 Setting up demo household...");
    let demoHousehold = await prisma.household.findFirst({
      where: { name: DEMO_HOUSEHOLD_NAME },
    });

    if (demoHousehold) {
      console.log(`   Found existing demo household, deleting...`);
      await prisma.household.delete({
        where: { id: demoHousehold.id },
      });
    }

    demoHousehold = await prisma.household.create({
      data: {
        name: DEMO_HOUSEHOLD_NAME,
      },
    });
    console.log(`✅ Created demo household: ${DEMO_HOUSEHOLD_NAME}`);
    console.log(`   Household ID: ${demoHousehold.id}`);

    // 4. Add demo user as owner of household
    await prisma.householdMember.create({
      data: {
        userId: demoUser.id,
        householdId: demoHousehold.id,
        role: "owner",
      },
    });
    console.log(`✅ Added demo user as household owner`);

    // 5. Create kitchen locations
    console.log("\n📍 Creating kitchen locations...");
    const locations = await Promise.all([
      prisma.kitchenLocation.create({
        data: { householdId: demoHousehold.id, name: "Pantry" },
      }),
      prisma.kitchenLocation.create({
        data: { householdId: demoHousehold.id, name: "Fridge" },
      }),
      prisma.kitchenLocation.create({
        data: { householdId: demoHousehold.id, name: "Freezer" },
      }),
    ]);
    console.log(`✅ Created 3 kitchen locations: Pantry, Fridge, Freezer`);

    const locationMap = new Map(locations.map((loc) => [loc.name, loc.id]));

    // 6. Seed inventory items
    console.log("\n📦 Seeding inventory items...");
    for (const item of inventoryItems) {
      const locationId = locationMap.get(item.location);
      if (!locationId) {
        console.error(`   ❌ Location "${item.location}" not found`);
        continue;
      }

      const foodItem = await prisma.foodItem.create({
        data: {
          name: item.name,
        },
      });

      await prisma.inventoryItem.create({
        data: {
          householdId: demoHousehold.id,
          foodItemId: foodItem.id,
          locationId: locationId,
          quantity: item.quantity,
          unit: item.unit,
          expiresOn: item.expiresOn || null,
          category: item.category || null,
        },
      });
    }
    console.log(`✅ Seeded ${inventoryItems.length} inventory items`);

    // 7. Seed recipes
    console.log("\n📖 Seeding recipes...");
    for (const recipeData of recipes) {
      const recipe = await prisma.recipe.create({
        data: {
          householdId: demoHousehold.id,
          title: recipeData.title,
          description: recipeData.description,
          servings: recipeData.servings,
          totalTimeMinutes: recipeData.totalTimeMinutes,
          visibility: "private",
        },
      });

      // Add ingredients
      for (let i = 0; i < recipeData.ingredients.length; i++) {
        const ing = recipeData.ingredients[i];
        await prisma.recipeIngredient.create({
          data: {
            recipeId: recipe.id,
            name: ing.name,
            quantity: ing.quantity || null,
            unit: ing.unit || null,
            order: i,
          },
        });
      }

      // Add steps
      for (let i = 0; i < recipeData.steps.length; i++) {
        await prisma.recipeStep.create({
          data: {
            recipeId: recipe.id,
            text: recipeData.steps[i],
            order: i,
          },
        });
      }
    }
    console.log(`✅ Seeded ${recipes.length} recipes with ingredients and steps`);

    // 8. Create shopping list
    console.log("\n🛒 Creating shopping list...");
    const shoppingList = await prisma.shoppingList.create({
      data: {
        householdId: demoHousehold.id,
      },
    });

    for (let i = 0; i < shoppingListItems.length; i++) {
      const item = shoppingListItems[i];
      const foodItem = await prisma.foodItem.create({
        data: {
          name: item.name,
        },
      });

      await prisma.shoppingListItem.create({
        data: {
          shoppingListId: shoppingList.id,
          foodItemId: foodItem.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          source: "manual",
        },
      });
    }
    console.log(`✅ Created shopping list with ${shoppingListItems.length} items`);

    // 9. Create user preferences
    console.log("\n⚙️  Setting up user preferences...");
    await prisma.userPreferences.create({
      data: {
        userId: demoUser.id,
        measurementSystem: "metric",
        defaultWeightUnit: "g",
        defaultVolumeUnit: "ml",
      },
    });
    console.log(`✅ Created user preferences with metric system`);

    console.log("\n" + "=".repeat(50));
    console.log("✨ Demo seed completed successfully!");
    console.log("=".repeat(50));
    console.log("\n📋 Demo Account Details:");
    console.log(`   Email: ${DEMO_USER_EMAIL}`);
    console.log(`   Password: ${DEMO_USER_PASSWORD}`);
    console.log(`   User ID: ${demoUser.id}`);
    console.log(`\n🏠 Demo Household: ${DEMO_HOUSEHOLD_NAME}`);
    console.log(`   Household ID: ${demoHousehold.id}`);
    console.log(`\n📊 Data Summary:`);
    console.log(`   - 3 Kitchen locations`);
    console.log(`   - ${inventoryItems.length} Inventory items`);
    console.log(`   - ${recipes.length} Recipes`);
    console.log(`   - ${shoppingListItems.length} Shopping list items`);
    console.log("\n" + "=".repeat(50));
  } catch (error) {
    console.error("❌ Error during seed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedDemo();
