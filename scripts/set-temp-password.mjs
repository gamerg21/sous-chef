/**
 * One-off local helper: hash a temporary password with Lucia Scrypt (same
 * as @convex-dev/auth Password provider) and print the hash for the
 * internal Convex mutation to store.
 *
 * Usage:
 *   HASH=$(node scripts/set-temp-password.mjs 'TempPass123!')
 *   npx convex run users:setPasswordHashByEmail "{\"email\":\"you@example.com\",\"passwordHash\":\"$HASH\"}"
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("Usage: node scripts/set-temp-password.mjs '<password>'");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const pnpmLucia = join(
  process.cwd(),
  "node_modules/.pnpm/lucia@3.2.2/node_modules/lucia/dist/index.js",
);
if (!existsSync(pnpmLucia)) {
  console.error("Could not find lucia@3.2.2 under node_modules/.pnpm");
  process.exit(1);
}

const { Scrypt } = await import(pathToFileURL(pnpmLucia).href);
const hash = await new Scrypt().hash(password);
process.stdout.write(hash);
