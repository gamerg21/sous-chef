#!/usr/bin/env node
// One-shot backend setup for a home server. Runs inside the `setup` image.
//
//   node docker/setup.mjs           configure the backend (idempotent)
//   node docker/setup.mjs backup    export data + files into $BACKUP_DIR
//
// Deploys this checkout's Convex functions, sets SITE_URL, creates Convex Auth
// signing keys and the secrets encryption key when missing, copies optional
// email variables, and seeds units. Existing keys are never overwritten.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  backupPath,
  cliEnvironment,
  generateAuthKeys,
  generateEncryptionKey,
  normalizeOrigin,
  optionalVariables,
  resolveTarget,
} from "./setup-lib.mjs";

const CLI = new URL("../node_modules/convex/bin/main.js", import.meta.url).pathname;
const log = (message) => console.log(`[sous-chef setup] ${message}`);
const fail = (message) => {
  console.error(`[sous-chef setup] ${message}`);
  process.exit(1);
};

function convex(env, args, { capture = false } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) fail(`Could not start the Convex CLI: ${result.error.message}`);
  if (result.status !== 0) {
    if (capture && result.stderr) console.error(result.stderr);
    fail(`convex ${args[0]} failed (exit ${result.status}).`);
  }
  return result;
}

function getVariable(env, name) {
  const result = convex(env, ["env", "get", name], { capture: true });
  // The installed CLI exits successfully with empty stdout for an absent value.
  // Any failed read must abort instead of authorizing replacement of a secret.
  return (result.stdout ?? "").trim();
}

function setVariable(env, name, value, { secret = false } = {}) {
  const result = spawnSync(process.execPath, [CLI, "env", "set", "--", name, value], {
    env,
    stdio: secret ? ["ignore", "ignore", "inherit"] : "inherit",
  });
  if (result.status !== 0) fail(`Could not set ${name} (exit ${result.status}).`);
  log(`Set ${name}${secret ? " (value hidden)" : ` = ${value}`}`);
}

async function waitForBackend(url) {
  const deadline = Date.now() + 180_000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/version`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return (await response.text()).trim();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  fail(`Backend at ${url} did not answer within 3 minutes (${lastError}).`);
}

async function configure() {
  const target = resolveTarget(process.env, (file) => readFileSync(file, "utf8"));
  const env = cliEnvironment(process.env, target);
  const siteUrl = normalizeOrigin(process.env.SITE_URL, "SITE_URL");

  if (target.kind === "self-hosted") {
    const version = await waitForBackend(target.backendUrl);
    log(`Backend ${target.backendUrl} is up (version ${version}).`);
  } else {
    log("Configuring the Convex Cloud deployment selected by CONVEX_DEPLOY_KEY.");
  }

  // Read every existing key before making changes. A partial signing pair must
  // be restored by the operator; silently generating a new pair would rotate it.
  const privateKey = getVariable(env, "JWT_PRIVATE_KEY");
  const jwks = getVariable(env, "JWKS");
  const encryptionKey = getVariable(env, "SECRETS_ENCRYPTION_KEY");
  if (Boolean(privateKey) !== Boolean(jwks)) {
    fail("Incomplete Convex Auth signing keys. Restore the matching JWT_PRIVATE_KEY and JWKS from backup before rerunning setup. Existing keys were not changed.");
  }

  log("Deploying Convex functions…");
  convex(env, ["deploy", "-y", "--typecheck", "disable", "--codegen", "disable"]);

  const currentSiteUrl = getVariable(env, "SITE_URL");
  if (currentSiteUrl !== siteUrl) setVariable(env, "SITE_URL", siteUrl);
  else log(`SITE_URL already ${siteUrl}`);
  const legacyBaseUrl = getVariable(env, "APP_BASE_URL");
  if (legacyBaseUrl && legacyBaseUrl !== siteUrl) {
    log(`APP_BASE_URL (${legacyBaseUrl}) overrides SITE_URL; updating it to match.`);
    setVariable(env, "APP_BASE_URL", siteUrl);
  }

  if (privateKey && jwks) {
    log("Convex Auth signing keys already exist; keeping them.");
  } else {
    log("Generating Convex Auth signing keys…");
    const keys = generateAuthKeys();
    setVariable(env, "JWT_PRIVATE_KEY", keys.JWT_PRIVATE_KEY, { secret: true });
    setVariable(env, "JWKS", keys.JWKS, { secret: true });
  }

  if (encryptionKey) {
    log("SECRETS_ENCRYPTION_KEY already exists; keeping it.");
  } else {
    setVariable(env, "SECRETS_ENCRYPTION_KEY", generateEncryptionKey(), { secret: true });
  }

  for (const [name, value] of Object.entries(optionalVariables(process.env))) {
    if (getVariable(env, name) !== value) setVariable(env, name, value, { secret: name === "RESEND_API_KEY" });
  }

  log("Seeding measurement units…");
  convex(env, ["run", "units:seed"]);

  log("Done. Backend configured for the app at " + siteUrl);
}

function backup() {
  const target = resolveTarget(process.env, (file) => readFileSync(file, "utf8"));
  const env = cliEnvironment(process.env, target);
  const path = backupPath(process.env.BACKUP_DIR || "/backups");
  log(`Exporting database tables and uploaded files to ${path}…`);
  convex(env, ["export", "--include-file-storage", "--path", path]);
  log("Backup complete. Keep the Convex Auth and encryption keys separately; the export does not contain them.");
}

const mode = process.argv[2] ?? "configure";
try {
  if (mode === "configure") await configure();
  else if (mode === "backup") backup();
  else fail(`Unknown mode "${mode}". Use "configure" or "backup".`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
