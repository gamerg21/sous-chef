import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { parseSnapshot } from '../src/lib/community-contract';
import { BodyTooLarge, bearerUser, json, readBoundedJson } from './httpUtil';
export const browse=httpAction(async(ctx,request)=>{
  try{const url=new URL(request.url);const path=url.pathname.slice('/api/v1/recipes'.length);
    if(path){const recipe=await ctx.runQuery(api.hub.get,{id:decodeURIComponent(path.slice(1)) as Id<'hubRecipes'>});return recipe?json(recipe):json({error:'Not found'},404);}
    return json(await ctx.runQuery(api.hub.list,{search:url.searchParams.get('search')||undefined,limit:Number(url.searchParams.get('limit')||20)}));
  }catch{return json({error:'Invalid recipe request'},400);}
});
export const write=httpAction(async(ctx,request)=>{
  const userId=await bearerUser(ctx,request);if(!userId)return json({error:'Not authenticated'},401);
  try {
    // Mutation validators check these fields at runtime.
    const body=await readBoundedJson(request,800000) as {id?:Id<'hubRecipes'>;sourceKey?:string;snapshot?:unknown;visibility:'public'|'unlisted'};const path=new URL(request.url).pathname;
    if(path==='/api/v1/me')return json({userId});
    if(path==='/api/v1/publish')return json(await ctx.runMutation(internal.hub.publish,{userId,id:body.id,sourceKey:body.sourceKey,snapshot:parseSnapshot(body.snapshot),visibility:body.visibility}));
    if(path==='/api/v1/unpublish'){await ctx.runMutation(internal.hub.unpublish,{userId,id:body.id!});return json({success:true});}
    return json({error:'Not found'},404);
  }catch(error){if(error instanceof BodyTooLarge)return json({error:'Recipe too large'},413);return json({error:'Publication rejected'},400);}
});
