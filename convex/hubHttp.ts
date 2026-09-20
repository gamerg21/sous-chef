import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { hashCommunityToken } from './hub';
import { parseSnapshot } from '../src/lib/community-contract';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const browse=httpAction(async(ctx,request)=>{
  try{const url=new URL(request.url);const path=url.pathname.slice('/api/v1/recipes'.length);
    if(path){const recipe=await ctx.runQuery(api.hub.get,{id:decodeURIComponent(path.slice(1)) as Id<'hubRecipes'>});return recipe?json(recipe):json({error:'Not found'},404);}
    return json(await ctx.runQuery(api.hub.list,{search:url.searchParams.get('search')||undefined,limit:Number(url.searchParams.get('limit')||20)}));
  }catch{return json({error:'Invalid recipe request'},400);}
});
export const write=httpAction(async(ctx,request)=>{
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token || token.length>512)return json({error:'Not authenticated'},401);
  const userId=await ctx.runQuery(internal.hub.identify,{hash:await hashCommunityToken(token)});if(!userId)return json({error:'Not authenticated'},401);
  try {
    // Bound the body before parsing, including chunked requests.
    const reader=request.body?.getReader();let size=0;let text='';const decoder=new TextDecoder();
    if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>800000){await reader.cancel();return json({error:'Recipe too large'},413);}text+=decoder.decode(part.value,{stream:true});}
    text+=decoder.decode();const body=JSON.parse(text||'{}');const path=new URL(request.url).pathname;
    if(path==='/api/v1/me')return json({userId});
    if(path==='/api/v1/publish')return json(await ctx.runMutation(internal.hub.publish,{userId,id:body.id,sourceKey:body.sourceKey,snapshot:parseSnapshot(body.snapshot),visibility:body.visibility}));
    if(path==='/api/v1/unpublish'){await ctx.runMutation(internal.hub.unpublish,{userId,id:body.id});return json({success:true});}
    return json({error:'Not found'},404);
  }catch{return json({error:'Publication rejected'},400);}
});
