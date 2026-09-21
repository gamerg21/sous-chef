import packageInfo from '../../../../package.json';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ version: packageInfo.version, revision: process.env.SOUS_CHEF_BUILD_REVISION || 'local' }, { headers: { 'Cache-Control': 'no-store' } });
}
