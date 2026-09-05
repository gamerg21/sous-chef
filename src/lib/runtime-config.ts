/** Only public, browser-safe settings belong in this response. */
export function getPublicRuntimeConfig(env: Record<string, string | undefined>) {
  const value = (env.CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL)?.trim();
  if (!value) return { convexUrl: null };
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/' ||
        url.hostname === 'your-deployment.convex.cloud' || url.hostname === 'placeholder.convex.cloud') {
      return { convexUrl: null };
    }
    return { convexUrl: url.origin };
  } catch {
    return { convexUrl: null };
  }
}
