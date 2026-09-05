import { createPublicKey, createPrivateKey, createSign, createVerify } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  backupPath,
  cliEnvironment,
  generateAuthKeys,
  generateEncryptionKey,
  normalizeOrigin,
  optionalVariables,
  resolveTarget,
} from "../docker/setup-lib.mjs";

describe("home server setup helpers", () => {
  test("auth keys match the official initializer format and verify each other", () => {
    const { JWT_PRIVATE_KEY, JWKS } = generateAuthKeys();
    expect(JWT_PRIVATE_KEY.startsWith("-----BEGIN PRIVATE KEY----- ")).toBe(true);
    expect(JWT_PRIVATE_KEY.endsWith("-----END PRIVATE KEY-----")).toBe(true);
    expect(JWT_PRIVATE_KEY.includes("\n")).toBe(false);

    const jwks = JSON.parse(JWKS) as { keys: Array<Record<string, string>> };
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ use: "sig", kty: "RSA" });
    expect(jwks.keys[0].n).toBeTruthy();
    expect(jwks.keys[0].e).toBe("AQAB");

    // Convex Auth reads the key back by restoring the newlines.
    const privateKey = createPrivateKey(JWT_PRIVATE_KEY.replace(/ /g, "\n").replace(/\nPRIVATE\nKEY/g, " PRIVATE KEY"));
    const publicKey = createPublicKey({ key: jwks.keys[0], format: "jwk" });
    const signature = createSign("RSA-SHA256").update("sous chef").sign(privateKey);
    expect(createVerify("RSA-SHA256").update("sous chef").verify(publicKey, signature)).toBe(true);
  });

  test("encryption key is a fresh 32-byte base64 string", () => {
    const first = generateEncryptionKey();
    expect(Buffer.from(first, "base64")).toHaveLength(32);
    expect(generateEncryptionKey()).not.toBe(first);
  });

  test("origins are validated and normalized", () => {
    expect(normalizeOrigin(" http://192.168.1.20:3000/ ", "SITE_URL")).toBe("http://192.168.1.20:3000");
    expect(normalizeOrigin("https://kitchen.example.com", "SITE_URL")).toBe("https://kitchen.example.com");
    expect(() => normalizeOrigin("my kitchen server", "SITE_URL")).toThrow(/full URL/);
    expect(() => normalizeOrigin("kitchen.local:3000", "SITE_URL")).toThrow(/http\(s\) origin/);
    expect(() => normalizeOrigin("http://host:3000/app", "SITE_URL")).toThrow(/path/);
    expect(() => normalizeOrigin("http://user:pw@host:3000", "SITE_URL")).toThrow(/credentials/);
    expect(() => normalizeOrigin(undefined, "SITE_URL")).toThrow(/SITE_URL/);
  });

  test("self-hosted target reads the admin key from the keygen file", () => {
    const files: Record<string, string> = { "/run/sous-chef/admin_key": "sous-chef|abc123\n" };
    const target = resolveTarget(
      { CONVEX_SELF_HOSTED_URL: "http://backend:3210" },
      (file: string) => {
        if (!(file in files)) throw new Error("missing");
        return files[file];
      },
    );
    expect(target).toEqual({
      kind: "self-hosted",
      backendUrl: "http://backend:3210",
      cliEnv: { CONVEX_SELF_HOSTED_URL: "http://backend:3210", CONVEX_SELF_HOSTED_ADMIN_KEY: "sous-chef|abc123" },
    });
  });

  test("self-hosted target prefers an explicit admin key and fails loudly without one", () => {
    const explicit = resolveTarget(
      { CONVEX_SELF_HOSTED_URL: "http://backend:3210", CONVEX_SELF_HOSTED_ADMIN_KEY: " key " },
      () => {
        throw new Error("should not read");
      },
    );
    expect(explicit.cliEnv.CONVEX_SELF_HOSTED_ADMIN_KEY).toBe("key");
    expect(() =>
      resolveTarget({ CONVEX_SELF_HOSTED_URL: "http://backend:3210" }, () => {
        throw new Error("missing");
      }),
    ).toThrow(/No admin key/);
    expect(() => resolveTarget({ CONVEX_SELF_HOSTED_URL: "http://backend:3210" }, () => "\n")).toThrow(/empty/);
  });

  test("cloud target uses the deploy key and nothing else", () => {
    expect(resolveTarget({ CONVEX_DEPLOY_KEY: "prod:x|y" }, () => "")).toEqual({
      kind: "cloud",
      backendUrl: null,
      cliEnv: { CONVEX_DEPLOY_KEY: "prod:x|y" },
    });
    expect(() => resolveTarget({}, () => "")).toThrow(/Nothing to configure/);
  });

  test("CLI environment drops inherited deployment selections", () => {
    const target = resolveTarget({ CONVEX_SELF_HOSTED_URL: "http://backend:3210", CONVEX_SELF_HOSTED_ADMIN_KEY: "k" }, () => "");
    const env = cliEnvironment(
      { CONVEX_DEPLOYMENT: "dev:foo", NEXT_PUBLIC_CONVEX_URL: "https://x", CONVEX_DEPLOY_KEY: "leak", PATH: "/bin" },
      target,
    );
    expect(env.CONVEX_DEPLOYMENT).toBeUndefined();
    expect(env.NEXT_PUBLIC_CONVEX_URL).toBeUndefined();
    expect(env.CONVEX_DEPLOY_KEY).toBeUndefined();
    expect(env.CONVEX_SELF_HOSTED_ADMIN_KEY).toBe("k");
    expect(env.PATH).toBe("/bin");

    const cloud = cliEnvironment(
      { CONVEX_SELF_HOSTED_URL: "http://stale", CONVEX_SELF_HOSTED_ADMIN_KEY: "stale" },
      resolveTarget({ CONVEX_DEPLOY_KEY: "prod:x|y" }, () => ""),
    );
    expect(cloud.CONVEX_SELF_HOSTED_URL).toBeUndefined();
    expect(cloud.CONVEX_DEPLOY_KEY).toBe("prod:x|y");
  });

  test("optional variables are copied only when non-empty", () => {
    expect(optionalVariables({ RESEND_API_KEY: "", SMTP_FROM: " Kitchen <k@example.com> " })).toEqual({
      SMTP_FROM: "Kitchen <k@example.com>",
    });
  });

  test("backup paths are timestamped inside the mounted directory", () => {
    expect(backupPath("/backups/", new Date("2026-09-05T10:20:30.123Z"))).toBe(
      "/backups/sous-chef-2026-09-05_10-20-30.zip",
    );
  });
});
