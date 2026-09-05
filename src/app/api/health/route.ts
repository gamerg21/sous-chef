import { getPublicRuntimeConfig } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

// Web process/config readiness, not a claim about backend reachability.
export function GET() {
  const configured = Boolean(getPublicRuntimeConfig(process.env).convexUrl);
  return Response.json({ status: configured ? 'ready' : 'setup-required' }, {
    status: configured ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
