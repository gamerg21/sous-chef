import { cookies } from 'next/headers';
import { COOKIE, session } from '@/server/kitchen/authentication';
import { getDatabase } from '@/server/kitchen/database';
import { checkOrigin, readJson, failure } from '@/server/kitchen/http';
import { releaseStatus, requestUpdate, updaterStatus } from '@/server/kitchen/updates';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function identity() {
  const user = await session((await cookies()).get(COOKIE)?.value);
  if (!user) throw new Error('Not authenticated');
  const admin = !user.demoExpiresAt && process.env.SOUS_CHEF_DEMO !== 'true' && await getDatabase().transaction(async db =>
    !!await db.query('appAdmins').withIndex('by_userId', q => q.eq('userId', user._id)).first(), false);
  return { admin: !!admin, demo: !!user.demoExpiresAt || process.env.SOUS_CHEF_DEMO === 'true' };
}
export async function GET() {
  try {
    const user = await identity();
    const [release, updater] = await Promise.all([releaseStatus(), updaterStatus()]);
    return Response.json({ ...release, ...updater, ...user }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await identity();
    if (!user.admin) return Response.json({ error: 'Instance administrator access required.' }, { status: 403 });
    const body = await readJson(request, 1024);
    if (body.action === 'check') return Response.json(await releaseStatus(true), { headers: { 'Cache-Control': 'no-store' } });
    if (body.action !== 'install' || typeof body.version !== 'string') throw new Error('Invalid update request');
    const id = await requestUpdate(body.version);
    return Response.json({ queued: true, id }, { status: 202 });
  } catch (error) { return failure(error); }
}
