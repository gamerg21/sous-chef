import { cookies } from 'next/headers';
import { COOKIE, session } from '@/server/kitchen/authentication';
import { execute, initialize } from '@/server/kitchen/execute';
import { checkOrigin, readJson, failure } from '@/server/kitchen/http';
export const runtime='nodejs';
export async function POST(request:Request) {
  try {checkOrigin(request);const user=await session((await cookies()).get(COOKIE)?.value);if(!user)throw new Error('Not authenticated');
    const body=await readJson(request);await initialize();
    if(user.demoExpiresAt && /^(aiProviders|recipeIdeas|admin|integrations):/.test(String(body.path)))throw new Error('This feature is disabled in the demo');
    const value=await execute(String(body.path),body.args??{},user._id);return Response.json({value:value??null},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
