import { cookies } from 'next/headers';
import { COOKIE, session, authenticate, digest, limit } from '@/server/kitchen/authentication';
import { getDatabase } from '@/server/kitchen/database';
import { checkOrigin, readJson, failure } from '@/server/kitchen/http';
import { randomBytes } from 'node:crypto';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET() {const user=await session((await cookies()).get(COOKIE)?.value);return Response.json({authenticated:!!user,demo:!!user?.demoExpiresAt,resetMode:process.env.RESEND_API_KEY?'email':'operator'},{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request) {
  try {checkOrigin(request);const body=await readJson(request,8192);const jar=await cookies();const database=getDatabase();
    if(body.flow==='signOut') {const token=jar.get(COOKIE)?.value;if(token)await database.transaction(async()=>{database.sql.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));});jar.delete(COOKIE);return Response.json({signingIn:false});}
    if(body.flow==='reset') {
      const email=String(body.email||'').trim().toLowerCase();
      const code=randomBytes(32).toString('base64url');
      const found=await database.transaction(async db=>{limit(database,`reset:${digest(email)}`,5);const user=await db.query('users').withIndex('email',q=>q.eq('email',email)).first();if(!user)return false;
        database.sql.prepare('DELETE FROM reset_tokens WHERE user_id=?').run(user._id);database.sql.prepare('INSERT INTO reset_tokens VALUES(?,?,?)').run(digest(code),user._id,Date.now()+3600000);return true;});
      if(found && process.env.RESEND_API_KEY && process.env.APP_URL) {
        const url=new URL('/auth/reset-password',process.env.APP_URL);url.searchParams.set('code',code);url.searchParams.set('email',email);
        const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.SMTP_FROM||'Sous Chef <onboarding@resend.dev>',to:email,subject:'Reset your Sous Chef password',text:`Reset your password: ${url}`}),signal:AbortSignal.timeout(10000)});
        if(!sent.ok)console.error('Password reset email delivery failed');
      }
      return Response.json({signingIn:false});
    }
    const result=await authenticate(body);
    if(result.token)jar.set(COOKIE,result.token,{httpOnly:true,sameSite:'lax',secure:process.env.APP_URL?.startsWith('https://')??new URL(request.url).protocol==='https:',path:'/',maxAge:body.flow==='demo'?86400:30*86400});
    return Response.json({signingIn:result.signingIn});
  }catch(error){return failure(error);}
}
