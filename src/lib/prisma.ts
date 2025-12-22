import { PrismaClient } from "../generated/prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7 requires adapter when using custom output path
function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is required. " +
      "Please ensure DATABASE_URL is set in your environment variables. " +
      "For Next.js builds, make sure DATABASE_URL is available during the build process."
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter: adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  } as any);
}

// Use lazy initialization to avoid creating client during module load
// This helps with Next.js builds where DATABASE_URL might not be available immediately
let _prisma: PrismaClient | undefined = globalForPrisma.prisma;

function getPrisma(): PrismaClient {
  if (_prisma) {
    return _prisma;
  }

  _prisma = createPrismaClient();
  
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = _prisma;
  }
  
  return _prisma;
}

// Export a proxy that lazily initializes the Prisma client
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = (client as any)[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

