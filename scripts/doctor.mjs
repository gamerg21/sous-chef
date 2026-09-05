import { existsSync } from 'node:fs';

// Same precedence as local Next.js development, without printing any secrets.
for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) process.loadEnvFile(path);
}
let failures = 0;
const report = (ok, message) => { console.log(`${ok ? 'OK' : 'FIX'}  ${message}`); if (!ok) failures++; };
const [major, minor] = process.versions.node.split('.').map(Number);
report(major > 20 || (major === 20 && minor >= 19), 'Node.js 20.19+ or 22+ is required (22 is used by Docker).');
const value = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
let url;
try {
  url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/' || /^(your-deployment|placeholder)\.convex\.cloud$/.test(url.hostname)) url = undefined;
} catch { /* Report a setup instruction below. */ }
report(Boolean(url), 'Set NEXT_PUBLIC_CONVEX_URL in .env.local for development or .env for Docker.');
if (url) {
  try {
    const response = await fetch(url.origin, { signal: AbortSignal.timeout(8000) });
    report(response.status < 500, 'Convex endpoint is reachable from this machine (browser/phone access must also be checked).');
  } catch {
    report(false, 'Convex endpoint is unreachable. Check the backend, URL, network, and TLS certificate.');
  }
}
console.log('\nBackend checklist (set these on Convex, not in the web container):');
console.log('  Initialize Convex Auth signing keys with pnpm exec auth.');
console.log('  Set SITE_URL to the exact browser URL; keep any APP_BASE_URL override in sync.');
console.log('  Deploy functions, then seed units: pnpm exec convex run units:seed');
console.log('  Optional email: RESEND_API_KEY + a verified SMTP_FROM sender.');
console.log('  Without email, the operator retrieves password recovery links from Convex logs.');
console.log('  See docs/CONVEX_SETUP.md. This check does not verify login or email delivery.');
process.exitCode = failures ? 1 : 0;
