#!/usr/bin/env tsx
/**
 * Script to set a password for an existing user
 * 
 * Usage:
 *   npm run set-password <email> <password>
 *   or
 *   tsx scripts/set-user-password.ts <email> <password>
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

async function setUserPassword(email: string, password: string) {
  try {
    // Find the user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.error(`❌ User with email "${email}" not found.`);
      process.exit(1);
    }

    // Hash the password (using same salt rounds as signup: 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the user's password
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    console.log(`✅ Password successfully set for user: ${email}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Name: ${user.name || "N/A"}`);
  } catch (error) {
    console.error("❌ Error setting password:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error("Usage: npm run set-password <email> <password>");
  console.error("   or: tsx scripts/set-user-password.ts <email> <password>");
  process.exit(1);
}

const [email, password] = args;

if (!email || !password) {
  console.error("❌ Both email and password are required.");
  process.exit(1);
}

if (password.length < 8) {
  console.error("❌ Password must be at least 8 characters long.");
  process.exit(1);
}

setUserPassword(email, password);

