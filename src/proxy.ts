import { NextResponse, type NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Keep new writes out of the migration/health-check window, including other browsers.
export async function proxy(request: NextRequest) {
  const directory = process.env.SOUS_CHEF_UPDATE_DIR;
  const pathname = request.nextUrl.pathname;
  if (!directory || ['/api/health', '/api/version', '/api/system/updates'].includes(pathname)) return NextResponse.next();
  try {
    const status = JSON.parse(await readFile(join(directory, 'status.json'), 'utf8'));
    if (['backing-up', 'restarting', 'rolling-back', 'recovery-required'].includes(status.phase)) {
      return NextResponse.json({ error: 'Your kitchen is updating. Please try again shortly.' }, { status: 503, headers: { 'Retry-After': '5', 'Cache-Control': 'no-store' } });
    }
  } catch { /* An unconfigured updater must not prevent local startup. */ }
  return NextResponse.next();
}
export const config = { matcher: '/api/:path*' };
