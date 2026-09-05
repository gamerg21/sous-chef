import { getPublicRuntimeConfig } from '@/lib/runtime-config';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(getPublicRuntimeConfig(process.env), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
