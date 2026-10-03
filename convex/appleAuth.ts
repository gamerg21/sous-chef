// Sign in with Apple helpers for the community service. WebCrypto only, so they
// run in the default Convex runtime and in tests without extra dependencies.

export const APPLE_ISSUER = 'https://appleid.apple.com';
const KEYS_URL = `${APPLE_ISSUER}/auth/keys`;
const CLOCK_SKEW_S = 60;

export type AppleConfig = { teamId: string; keyId: string; bundleId: string; privateKey: string };
export type AppleJwk = { kty: string; kid: string; alg?: string; use?: string; n?: string; e?: string; crv?: string; x?: string; y?: string };
export type AppleClaims = { sub: string; iss: string; aud: string | string[]; exp: number; iat?: number; nonce?: string };

export class AppleTokenError extends Error {}

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new AppleTokenError('Malformed token');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function appleConfig(): AppleConfig | null {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const keyId = process.env.APPLE_KEY_ID?.trim();
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  return teamId && keyId && bundleId && privateKey ? { teamId, keyId, bundleId, privateKey } : null;
}

let keyCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function appleKeys(kid: string): Promise<AppleJwk[]> {
  const fresh = keyCache && Date.now() - keyCache.fetchedAt < 3600_000;
  if (fresh && keyCache!.keys.some((k) => k.kid === kid)) return keyCache!.keys;
  const response = await fetch(KEYS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Apple keys unavailable (${response.status})`);
  const body = (await response.json()) as { keys?: AppleJwk[] };
  if (!Array.isArray(body.keys)) throw new Error('Apple keys unavailable');
  keyCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

function verifyParams(alg: string, jwk: AppleJwk) {
  if (alg === 'RS256' && jwk.kty === 'RSA') {
    return { importAlg: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verifyAlg: { name: 'RSASSA-PKCS1-v1_5' } };
  }
  if (alg === 'ES256' && jwk.kty === 'EC' && jwk.crv === 'P-256') {
    return { importAlg: { name: 'ECDSA', namedCurve: 'P-256' }, verifyAlg: { name: 'ECDSA', hash: 'SHA-256' } };
  }
  throw new AppleTokenError('Unsupported token algorithm');
}

/**
 * Verifies an Apple identity token: signature against Apple's JWKS, issuer,
 * audience (the app's bundle ID), expiry, and that its nonce is SHA-256(rawNonce).
 * `keys` and `now` (ms) are injectable for tests.
 */
export async function verifyIdentityToken(
  token: string,
  options: { audience: string; rawNonce: string; keys?: AppleJwk[]; now?: number },
): Promise<AppleClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AppleTokenError('Malformed token');
  let header: { alg?: string; kid?: string };
  let claims: AppleClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    throw new AppleTokenError('Malformed token');
  }
  if (typeof header.alg !== 'string' || typeof header.kid !== 'string') throw new AppleTokenError('Malformed token');
  const keys = options.keys ?? (await appleKeys(header.kid));
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk || (jwk.alg && jwk.alg !== header.alg)) throw new AppleTokenError('Unknown signing key');
  const { importAlg, verifyAlg } = verifyParams(header.alg, jwk);
  const key = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, importAlg, false, ['verify']);
  const valid = await crypto.subtle.verify(verifyAlg, key, base64UrlDecode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new AppleTokenError('Invalid signature');

  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (claims.iss !== APPLE_ISSUER) throw new AppleTokenError('Wrong issuer');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) throw new AppleTokenError('Wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < now) throw new AppleTokenError('Token expired');
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S > now) throw new AppleTokenError('Token not yet valid');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new AppleTokenError('Missing subject');
  if (typeof claims.nonce !== 'string' || claims.nonce !== (await sha256Hex(options.rawNonce))) throw new AppleTokenError('Nonce mismatch');
  return claims;
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** The ES256 client secret Apple's token and revoke endpoints expect. Valid for five minutes. */
export async function appleClientSecret(config: AppleConfig, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const segment = (value: object) => base64UrlEncode(encoder.encode(JSON.stringify(value)));
  const input = `${segment({ alg: 'ES256', kid: config.keyId, typ: 'JWT' })}.${segment({ iss: config.teamId, iat, exp: iat + 300, aud: APPLE_ISSUER, sub: config.bundleId })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(config.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input));
  return `${input}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function postForm(path: string, fields: Record<string, string>) {
  return fetch(`${APPLE_ISSUER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(10_000),
  });
}

/** Exchanges an authorization code for a refresh token (kept only for revocation). */
export async function exchangeAuthorizationCode(config: AppleConfig, code: string): Promise<string> {
  const response = await postForm('/auth/token', {
    client_id: config.bundleId,
    client_secret: await appleClientSecret(config),
    code,
    grant_type: 'authorization_code',
  });
  if (!response.ok) throw new Error(`Apple token exchange failed (${response.status})`);
  const body = (await response.json()) as { refresh_token?: unknown };
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) throw new Error('Apple returned no refresh token');
  return body.refresh_token;
}

export async function revokeAppleToken(config: AppleConfig, refreshToken: string): Promise<void> {
  const response = await postForm('/auth/revoke', {
    client_id: config.bundleId,
    client_secret: await appleClientSecret(config),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  if (!response.ok) throw new Error(`Apple token revocation failed (${response.status})`);
}

export const DEFAULT_DISPLAY_NAME = 'Community cook';

/** Trims, collapses whitespace and bounds a display name; empty becomes undefined. */
export function cleanDisplayName(value: unknown, max = 40): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return name ? Array.from(name).slice(0, max).join('').trim() : undefined;
}
