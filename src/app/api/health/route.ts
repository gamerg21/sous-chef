import { getDatabase } from '@/server/kitchen/database';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET() {try{await getDatabase().transaction(async()=>{getDatabase().sql.prepare('SELECT 1').get();},false);return Response.json({status:'ready',backend:'sqlite'},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({status:'unavailable'},{status:503});}}
