/**
 * Encryption-at-rest helpers for stored secrets (AI provider API keys,
 * integration OAuth tokens).
 *
 * Uses AES-256-GCM via Web Crypto, which is available in Convex actions
 * (NOT in queries/mutations — always encrypt/decrypt from an action and
 * pass ciphertext to internal mutations for storage).
 *
 * The key is derived from the SECRETS_ENCRYPTION_KEY deployment environment
 * variable (any sufficiently random string; set it with
 * `npx convex env set SECRETS_ENCRYPTION_KEY <value>`). When the variable is
 * unset, values are stored as-is so self-hosted setups keep working — a
 * warning is logged on every write.
 */

const PREFIX = "enc:v1:";

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(passphrase),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const passphrase = process.env.SECRETS_ENCRYPTION_KEY;
  if (!passphrase) {
    console.warn(
      "[secrets] SECRETS_ENCRYPTION_KEY is not set — storing secret without " +
        "encryption at rest. Set it with: npx convex env set SECRETS_ENCRYPTION_KEY <value>",
    );
    return plaintext;
  }
  const key = await deriveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(value: string): Promise<string> {
  if (!isEncryptedSecret(value)) {
    return value;
  }
  const passphrase = process.env.SECRETS_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY is not set but an encrypted secret was found",
    );
  }
  const [ivPart, ctPart] = value.slice(PREFIX.length).split(":");
  if (!ivPart || !ctPart) {
    throw new Error("Malformed encrypted secret");
  }
  const key = await deriveKey(passphrase);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) as BufferSource },
    key,
    fromBase64(ctPart) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}
