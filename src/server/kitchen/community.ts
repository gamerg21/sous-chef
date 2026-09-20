import { createHash } from 'node:crypto';
import { v } from 'convex/values';
import { action, query, internalQuery, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId, getHouseholdMembership, ensureUserHasHousehold, decodeIngredientMapping } from './helpers';
import { encryptSecret, decryptSecret } from './secrets';
import { communityRecipe, parseSnapshot, type Publication, type RecipeSnapshot } from '../../lib/community-contract';

export function communityOrigin() {const value=process.env.COMMUNITY_API_URL;if(!value)return null;const url=new URL(value);if(url.protocol!=='https:' && !(process.env.NODE_ENV!=='production' && url.hostname==='localhost'))throw new Error('Community API requires HTTPS');return url.origin;}
export async function remote<T>(path:string,body?:unknown,token?:string):Promise<T> {
  const origin=communityOrigin();if(!origin)throw new Error('This instance has not connected to a community service');
  const res=await fetch(`${origin}/api/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
  if(!res.ok)throw new Error(res.status===401?'Connect your community account before publishing':'The community service could not complete this request');
  const text=await res.text();if(text.length>8000000)throw new Error('Community response too large');return JSON.parse(text) as T;
}
export const connection=query({args:{},handler:async ctx=>{const userId=await getAuthUserId(ctx);const connection=await ctx.db.query('communityConnections').withIndex('by_userId',q=>q.eq('userId',userId)).unique();return {configured:!!communityOrigin(),connected:!!connection};}});
export const setConnection=action({args:{token:v.string()},handler:async(ctx,{token}):Promise<{success:boolean}>=>{if(token.length>512)throw new Error('Invalid token');if(token)await remote('me',{},token);return ctx.runMutation(internal.community.storeConnection,{token:token?await encryptSecret(token):''});}});
export const storeConnection=internalMutation({args:{token:v.string()},handler:async(ctx,{token})=>{const userId=await getAuthUserId(ctx);const old=await ctx.db.query('communityConnections').withIndex('by_userId',q=>q.eq('userId',userId)).unique();if(old)await ctx.db.delete(old._id);if(token)await ctx.db.insert('communityConnections',{userId,token});return {success:true};}});
export const listRecipes=action({args:{search:v.optional(v.string()),tag:v.optional(v.string()),sort:v.optional(v.string()),limit:v.optional(v.number()),offset:v.optional(v.number())},handler:async(_ctx,args)=>{
  if(!communityOrigin())return {recipes:[],available:false};
  try {const result=await remote<{recipes:Publication[]}>(`recipes?${new URLSearchParams({search:args.search||'',limit:String(Math.min(args.limit||20,50))})}`);return {recipes:result.recipes.map(communityRecipe).filter(r=>!args.tag || r.tags?.some(t=>t.toLowerCase()===args.tag!.toLowerCase())),available:true};}
  catch{return {recipes:[],available:false};}
}});
export const getRecipe=action({args:{id:v.string()},handler:async(_ctx,{id})=>{const recipe=await remote<Publication>(`recipes/${encodeURIComponent(id)}`);return communityRecipe(recipe);}});
export const preparePublication=internalQuery({args:{recipeId:v.id('recipes'),includePhoto:v.optional(v.boolean())},handler:async(ctx,{recipeId,includePhoto})=>{
  const userId=await getAuthUserId(ctx);const recipe=await ctx.db.get(recipeId);if(!recipe || !await getHouseholdMembership(ctx,userId,recipe.householdId))throw new Error('Permission denied');
  const connection=await ctx.db.query('communityConnections').withIndex('by_userId',q=>q.eq('userId',userId)).unique();if(!connection)throw new Error('Connect your community account before publishing');
  const publication=await ctx.db.query('publications').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).unique();
  if(publication && (publication.userId!==userId || publication.origin!==communityOrigin()))throw new Error('Only the original publisher can update this publication');
  const ingredients=await ctx.db.query('recipeIngredients').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).collect();
  const steps=await ctx.db.query('recipeSteps').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).collect();
  let photoDataUrl:string|undefined;
  if(includePhoto!==false && recipe.photoUrl?.startsWith('/api/files/')){const file=ctx.files.read(recipe.photoUrl.split('/').pop()!);if(file){const bytes=file.bytes as Uint8Array;if(bytes.length>500000)throw new Error('Choose a photo under 500 KB before publishing');photoDataUrl=`data:${file.mime};base64,${Buffer.from(bytes).toString('base64')}`;}}
  const snapshot:RecipeSnapshot={version:1,title:recipe.title,description:recipe.description,tags:recipe.tags||[],servings:recipe.servings,totalTimeMinutes:recipe.totalTimeMinutes,sourceUrl:recipe.sourceUrl,photoDataUrl,ingredients:ingredients.sort((a,b)=>a.order-b.order).map(i=>({name:i.name,quantity:i.quantity,unit:i.unit,note:decodeIngredientMapping(i).note})),steps:steps.sort((a,b)=>a.order-b.order).map(s=>({text:s.text}))};
  return {token:connection.token,snapshot,remoteId:publication?.remoteId};
}});
export const recordPublication=internalMutation({args:{recipeId:v.id('recipes'),remoteId:v.string(),revision:v.number(),visibility:v.string()},handler:async(ctx,args)=>{const userId=await getAuthUserId(ctx);const recipe=await ctx.db.get(args.recipeId);if(!recipe || !await getHouseholdMembership(ctx,userId,recipe.householdId))throw new Error('Permission denied');const old=await ctx.db.query('publications').withIndex('by_recipeId',q=>q.eq('recipeId',args.recipeId)).unique();if(old)await ctx.db.delete(old._id);await ctx.db.insert('publications',{recipeId:args.recipeId,userId,remoteId:args.remoteId,revision:args.revision,origin:communityOrigin()!,visibility:args.visibility});return {success:true};}});
export const publishRecipe=action({args:{recipeId:v.id('recipes'),visibility:v.optional(v.union(v.literal('public'),v.literal('unlisted')))},handler:async(ctx,args):Promise<{success:boolean}>=>{
  const prepared=await ctx.runQuery(internal.community.preparePublication,{recipeId:args.recipeId});
  const result=await remote<{id:string;revision:number}>('publish',{id:prepared.remoteId,sourceKey:createHash('sha256').update(`${process.env.SECRETS_ENCRYPTION_KEY}:${args.recipeId}`).digest('hex'),snapshot:parseSnapshot(JSON.parse(JSON.stringify(prepared.snapshot))),visibility:args.visibility||'public'},await decryptSecret(prepared.token));
  return ctx.runMutation(internal.community.recordPublication,{recipeId:args.recipeId,remoteId:result.id,revision:result.revision,visibility:args.visibility||'public'});
}});
export const markUnpublished=internalMutation({args:{recipeId:v.id('recipes')},handler:async(ctx,{recipeId})=>{const userId=await getAuthUserId(ctx);const recipe=await ctx.db.get(recipeId);if(!recipe || !await getHouseholdMembership(ctx,userId,recipe.householdId))throw new Error('Permission denied');const publication=await ctx.db.query('publications').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).unique();if(publication)await ctx.db.patch(publication._id,{visibility:'private'});return {success:true};}});
export const unpublishRecipe=action({args:{recipeId:v.id('recipes')},handler:async(ctx,args):Promise<{success:boolean}>=>{const prepared=await ctx.runQuery(internal.community.preparePublication,{...args,includePhoto:false});if(prepared.remoteId)await remote('unpublish',{id:prepared.remoteId},await decryptSecret(prepared.token));return ctx.runMutation(internal.community.markUnpublished,args);}});
export const importPublication=internalMutation({args:{publication:v.any()},handler:async(ctx,{publication}:{publication:Publication})=>{
  const s=parseSnapshot(publication.snapshot);const userId=await getAuthUserId(ctx);const householdId=await ensureUserHasHousehold(ctx,userId);
  const recipeId=await ctx.db.insert('recipes',{householdId,title:s.title,description:s.description,tags:s.tags,servings:s.servings,totalTimeMinutes:s.totalTimeMinutes,sourceUrl:s.sourceUrl,visibility:'private',favorited:false});
  for(const [order,ingredient]of s.ingredients.entries())await ctx.db.insert('recipeIngredients',{recipeId,order,...ingredient});
  for(const [order,step]of s.steps.entries())await ctx.db.insert('recipeSteps',{recipeId,order,text:step.text});
  if(s.photoDataUrl){const match=/^data:([^;]+);base64,(.*)$/.exec(s.photoDataUrl)!;const id=ctx.files.store(match[1],Buffer.from(match[2],'base64'));const url=`/api/files/${id}`;await ctx.db.patch(recipeId,{photoUrl:url});await ctx.db.insert('mediaAssets',{url,recipeId});}
  await ctx.db.insert('recipeOrigins',{recipeId,remoteId:publication.id,revision:publication.revision,origin:communityOrigin()!,author:publication.author.name});return {savedRecipeId:recipeId};
}});
export const saveRecipe=action({args:{recipeId:v.string()},handler:async(ctx,{recipeId}):Promise<{savedRecipeId:string}>=>{const publication=await remote<Publication>(`recipes/${encodeURIComponent(recipeId)}`);parseSnapshot(publication.snapshot);return ctx.runMutation(internal.community.importPublication,{publication});}});
