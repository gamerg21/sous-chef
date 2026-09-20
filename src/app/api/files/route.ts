import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { COOKIE, session } from '@/server/kitchen/authentication';
import { getDatabase } from '@/server/kitchen/database';
import { failure } from '@/server/kitchen/http';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {
    const expected=new URL(process.env.APP_URL||request.url).origin;
    if(request.headers.get('origin')!==expected)throw new Error('Request origin rejected');
    const user=await session((await cookies()).get(COOKIE)?.value);if(!user)throw new Error('Not authenticated');
    const mime=request.headers.get('content-type')||'';if(!['image/jpeg','image/png','image/webp','image/gif'].includes(mime))throw new Error('Use a JPEG, PNG, WebP or GIF image');
    const reader=request.body?.getReader();if(!reader)throw new Error('Missing image');let size=0;const chunks:Uint8Array[]=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();throw new Error('Image must be under 5 MB');}chunks.push(value);}
    const id=randomUUID();const database=getDatabase();await database.transaction(async()=>{
      const count=database.sql.prepare('SELECT COUNT(*) AS n FROM files WHERE user_id=?').get(user._id);
      if(user.demoExpiresAt && Number(count?.n)>=10)throw new Error('Demo upload limit reached');
      database.sql.prepare('INSERT INTO files VALUES(?,?,?,?)').run(id,user._id,mime,Buffer.concat(chunks));
    });return Response.json({storageId:id});
  }catch(error){return failure(error);}
}
