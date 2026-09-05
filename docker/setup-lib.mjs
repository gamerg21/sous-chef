// Pure helpers for the one-shot setup job. Kept separate from setup.mjs so the
// logic can be unit tested without spawning the Convex CLI.
import { generateKeyPairSync, randomBytes } from "node:crypto";

/**
 * Generate Convex Auth signing keys in exactly the format the official
 * `@convex-dev/auth` initializer produces: a PKCS#8 PEM private key with
 * newlines collapsed to spaces, and a JWKS containing the RSA public key.
 */
export function generateAuthKeys() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const jwk = publicKey.export({ format: "jwk" });
  return {
    JWT_PRIVATE_KEY: pem.trimEnd().replace(/\n/g, " "),
    JWKS: JSON.stringify({ keys: [{ use: "sig", ...jwk }] }),
  };
}

/** Random passphrase for SECRETS_ENCRYPTION_KEY (any strong string works). */
export function generateEncryptionKey() {
  return randomBytes(32).toString("base64");
}

/** Validate a browser-facing origin such as http://192.168.1.20:3000. */
export function normalizeOrigin(value, name) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    throw new Error(`${name} must be a full URL such as http://192.168.1.20:3000`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be a plain http(s) origin without credentials, query, or fragment`);
  }
  if (url.pathname !== "/") {
    throw new Error(`${name} must not include a path (got ${url.pathname})`);
  }
  return url.origin;
}

/**
 * Decide which Convex deployment the job configures.
 *
 * Self-hosted: CONVEX_SELF_HOSTED_URL plus an admin key, given directly or
 * through a file written by the keygen sidecar. Cloud: CONVEX_DEPLOY_KEY, which
 * the Convex CLI reads on its own.
 */
export function resolveTarget(env, readFile) {
  const selfHostedUrl = env.CONVEX_SELF_HOSTED_URL?.trim();
  if (selfHostedUrl) {
    let adminKey = env.CONVEX_SELF_HOSTED_ADMIN_KEY?.trim();
    if (!adminKey) {
      const file = env.CONVEX_SELF_HOSTED_ADMIN_KEY_FILE?.trim() || "/run/sous-chef/admin_key";
      let contents;
      try {
        contents = readFile(file);
      } catch {
        throw new Error(`No admin key. Set CONVEX_SELF_HOSTED_ADMIN_KEY or provide it in ${file}.`);
      }
      adminKey = String(contents).trim().split("\n").filter(Boolean).pop() ?? "";
      if (!adminKey) throw new Error(`Admin key file ${file} is empty.`);
    }
    return {
      kind: "self-hosted",
      backendUrl: normalizeOrigin(selfHostedUrl, "CONVEX_SELF_HOSTED_URL"),
      cliEnv: { CONVEX_SELF_HOSTED_URL: selfHostedUrl, CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey },
    };
  }
  const deployKey = env.CONVEX_DEPLOY_KEY?.trim();
  if (deployKey) {
    return { kind: "cloud", backendUrl: null, cliEnv: { CONVEX_DEPLOY_KEY: deployKey } };
  }
  throw new Error(
    "Nothing to configure. Set CONVEX_SELF_HOSTED_URL (self-hosted backend) or CONVEX_DEPLOY_KEY (Convex Cloud).",
  );
}

/** Environment passed to the Convex CLI: no inherited deployment selection. */
export function cliEnvironment(baseEnv, target) {
  const env = { ...baseEnv, ...target.cliEnv, CI: "1", CONVEX_AGENT_MODE: "anonymous" };
  for (const name of ["CONVEX_DEPLOYMENT", "CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL"]) delete env[name];
  if (target.kind === "self-hosted") delete env.CONVEX_DEPLOY_KEY;
  else {
    delete env.CONVEX_SELF_HOSTED_URL;
    delete env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  }
  return env;
}

/** Optional deployment variables copied from the job environment when present. */
export function optionalVariables(env) {
  const out = {};
  for (const name of ["RESEND_API_KEY", "SMTP_FROM"]) {
    const value = env[name]?.trim();
    if (value) out[name] = value;
  }
  return out;
}

/** Timestamped backup file name inside the mounted backups directory. */
export function backupPath(dir, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `${dir.replace(/\/+$/, "")}/sous-chef-${stamp}.zip`;
}
