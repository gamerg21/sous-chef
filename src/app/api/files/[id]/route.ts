import { cookies } from 'next/headers';
import { COOKIE, session } from '@/server/kitchen/authentication';
import { getDatabase } from '@/server/kitchen/database';
import { readAuthorizedFile } from '@/server/kitchen/files';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await session((await cookies()).get(COOKIE)?.value);if(!user)return new Response('Not authenticated',{status:401});
 const {id}=await params;const database=getDatabase();const file=await database.transaction(async()=>readAuthorizedFile(database.sql,id,user._id),false);
 if(!file)return new Response('Not found',{status:404});
 return new Response(file.bytes as Uint8Array<ArrayBuffer>,{headers:{'Content-Type':file.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
