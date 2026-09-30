// Outgoing email goes through Resend, the same provider as password resets.
type Env = Record<string, string | undefined>;

/** Email works only with a Resend key and a public APP_URL, and never in the demo. */
export function emailConfigured(env: Env = process.env): boolean {
  return !!env.RESEND_API_KEY && !!env.APP_URL && env.SOUS_CHEF_DEMO !== 'true';
}

/** Whether this person could receive the daily expiry digest. */
export function expiryDigestAvailable(user: { email?: string; demoExpiresAt?: number } | null, env: Env = process.env): boolean {
  return emailConfigured(env) && !!user?.email && !user.demoExpiresAt;
}

export type Email = { to: string; subject: string; text: string };

export async function sendEmail(email: Email, env: Env = process.env): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.SMTP_FROM || 'Sous Chef <onboarding@resend.dev>', ...email }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
}
