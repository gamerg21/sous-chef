import { getDatabase } from '@/server/kitchen/database';
import { version } from '../../../../package.json';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await getDatabase().transaction(async () => {
      getDatabase().sql.prepare('SELECT 1').get();
    }, false);
    return Response.json({
      status: 'ready',
      backend: 'sqlite',
      version,
      revision: process.env.RENDER_GIT_COMMIT || process.env.SOUS_CHEF_BUILD_REVISION || 'local',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
