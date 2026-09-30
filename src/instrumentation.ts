// Runs once when the Next.js server starts. Background work stays out of the
// edge runtime and out of instances without email (including the demo).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.RESEND_API_KEY || !process.env.APP_URL || process.env.SOUS_CHEF_DEMO === 'true') return;
  const { startExpiryDigestScheduler } = await import('./server/kitchen/expiryDigest');
  startExpiryDigestScheduler();
}
