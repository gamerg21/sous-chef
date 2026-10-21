/** Configuration only; delivery still depends on Resend accepting the request. */
export function resetEmailConfiguration(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!apiKey || !from || !env.APP_URL?.trim()) return null;
  try {
    const url = new URL(env.APP_URL.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return { apiKey, from, origin: url.origin };
  } catch {
    return null;
  }
}
