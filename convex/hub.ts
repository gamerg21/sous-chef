import { v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { getAuthUserId } from './helpers';
import { snapshotValidator, parseSnapshot, type RecipeSnapshot } from '../src/lib/community-contract';
import { FILTER_MESSAGE, isObjectionable, snapshotTexts } from '../src/lib/community-filter';
import { checkAndRecordRateLimit } from './rateLimit';
import { deletePhoto, isViewable, syncRecipe, withoutPhoto, type Recipe } from './hubLib';
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const TOKEN_LIFETIME_MS=90*86400000;
const MAX_TOKENS=20;
/** A new random publisher token; only its hash is stored. */
export const newPublisherToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
/** True when a moderator banned this cook. */
export async function isBanned(ctx:QueryCtx,userId:Id<'users'>){return !!await ctx.db.query('hubBans').withIndex('by_userId',q=>q.eq('userId',userId)).first();}
/** Stores a publisher token hash. `replaceOldest` retires the oldest token at the limit instead of refusing. */
export async function storePublisherToken(ctx:MutationCtx,userId:Id<'users'>,hash:string,{replaceOldest=false}:{replaceOldest?:boolean}={}){
  if(await isBanned(ctx,userId))throw new Error('This community account is suspended');
  const now=Date.now();const old=await ctx.db.query('hubTokens').withIndex('by_userId',q=>q.eq('userId',userId)).take(100);
  const active=[];for(const token of old){if(token.expires<=now)await ctx.db.delete(token._id);else active.push(token);}
  if(active.length>=MAX_TOKENS){if(!replaceOldest)throw new Error('Revoke older community connections first');for(const token of active.slice(0,active.length-MAX_TOKENS+1))await ctx.db.delete(token._id);}
  await ctx.db.insert('hubTokens',{userId,hash,expires:now+TOKEN_LIFETIME_MS});
}
export const storeToken=internalMutation({args:{hash:v.string()},returns:v.null(),handler:async(ctx,{hash})=>{
  await storePublisherToken(ctx,await getAuthUserId(ctx),hash);return null;
}});
export const issueToken=action({args:{},returns:v.string(),handler:async ctx=>{
  const token=newPublisherToken();
  await ctx.runMutation(internal.hub.storeToken,{hash:await hash(token)});return token;
}});
export const revokeTokens=mutation({args:{},returns:v.null(),handler:async ctx=>{const userId=await getAuthUserId(ctx);const tokens=await ctx.db.query('hubTokens').withIndex('by_userId',q=>q.eq('userId',userId)).take(100);for(const token of tokens)await ctx.db.delete(token._id);return null;}});

// ── API v1 reads ────────────────────────────────────────────────────────
// The v1 shape carries the whole snapshot. A photo that moved to file storage
// is described by `photo` so the HTTP action can put it back inline.

/** Most inline photo data a v1 list may carry, so older clients keep loading. */
export const V1_PHOTO_BUDGET=6_000_000;
type StoredPhoto={id:Id<'_storage'>;type:string;size:number};
type V1Recipe={id:Id<'hubRecipes'>;revision:number;createdAt:string;author:{id:Id<'users'>;name:string};snapshot:RecipeSnapshot;photo?:StoredPhoto};

async function v1Recipe(ctx:QueryCtx,recipe:Recipe):Promise<V1Recipe>{
  const row:V1Recipe={id:recipe._id,revision:recipe.revision,createdAt:new Date(recipe._creationTime).toISOString(),author:{id:recipe.userId,name:(await ctx.db.get(recipe.userId))?.name||'Community cook'},snapshot:recipe.snapshot};
  if(recipe.photoId){
    const file=await ctx.db.system.get(recipe.photoId);
    if(file)row.photo={id:recipe.photoId,type:recipe.photoType||file.contentType||'image/jpeg',size:file.size};
  }
  return row;
}
async function v1List(ctx:QueryCtx,args:{search?:string;limit?:number}):Promise<V1Recipe[]>{
  const limit=Math.max(1,Math.min(50,Math.floor(args.limit||20)));
  const search=args.search?.trim().slice(0,200);
  const rows=search
    ?await ctx.db.query('hubRecipes').withSearchIndex('search_recipes',q=>q.search('searchText',search).eq('visibility','public').eq('underReview',undefined)).take(limit)
    :await ctx.db.query('hubRecipes').withIndex('by_visibility_and_underReview',q=>q.eq('visibility','public').eq('underReview',undefined)).order('desc').take(limit);
  // Documents from before API v2 hold their photo inline; keep the total bounded.
  let inline=0;
  return Promise.all(rows.map(async recipe=>{
    const row=await v1Recipe(ctx,recipe);
    const size=row.snapshot.photoDataUrl?.length??0;
    if(size && inline+size>V1_PHOTO_BUDGET)row.snapshot=withoutPhoto(row.snapshot);else inline+=size;
    return row;
  }));
}
async function v1Get(ctx:QueryCtx,id:Id<'hubRecipes'>):Promise<V1Recipe|null>{
  const recipe=await ctx.db.get(id);
  return recipe && isViewable(recipe)?v1Recipe(ctx,recipe):null;
}
const publicShape=({id,revision,createdAt,author,snapshot}:V1Recipe)=>({id,revision,createdAt,author,snapshot});

export const list=query({args:{search:v.optional(v.string()),limit:v.optional(v.number())},returns:v.any(),handler:async(ctx,args)=>{
  return {recipes:(await v1List(ctx,args)).map(publicShape)};
}});
export const get=query({args:{id:v.id('hubRecipes')},returns:v.any(),handler:async(ctx,{id})=>{
  const recipe=await v1Get(ctx,id);return recipe?publicShape(recipe):null;
}});
/** `list` for the v1 HTTP route, with stored photos described for inlining. */
export const listV1=internalQuery({args:{search:v.optional(v.string()),limit:v.optional(v.number())},returns:v.any(),handler:async(ctx,args)=>({recipes:await v1List(ctx,args)})});
/** `get` for the v1 HTTP route; `id` is untrusted text. */
export const getV1=internalQuery({args:{id:v.string()},returns:v.any(),handler:async(ctx,{id})=>{
  const recipeId=ctx.db.normalizeId('hubRecipes',id);return recipeId?v1Get(ctx,recipeId):null;
}});

export const identify=internalQuery({args:{hash:v.string()},returns:v.union(v.id('users'),v.null()),handler:async(ctx,{hash})=>{const token=await ctx.db.query('hubTokens').withIndex('by_hash',q=>q.eq('hash',hash)).unique();return token && token.expires>Date.now() && await ctx.db.get(token.userId) && !await isBanned(ctx,token.userId)?token.userId:null;}});

/**
 * Creates or updates a publication. The HTTP action stores the photo in file
 * storage first and passes `photoId`; the snapshot is then kept without
 * `photoDataUrl`. A snapshot that still carries an inline photo (no `photoId`)
 * is stored as is, which readers and `migrations:run` handle.
 */
export const publish=internalMutation({args:{userId:v.id('users'),id:v.optional(v.id('hubRecipes')),sourceKey:v.optional(v.string()),snapshot:snapshotValidator,visibility:v.union(v.literal('public'),v.literal('unlisted')),photoId:v.optional(v.id('_storage')),photoType:v.optional(v.string())},returns:v.object({id:v.id('hubRecipes'),revision:v.number()}),handler:async(ctx,args)=>{
  if(!await checkAndRecordRateLimit(ctx,{scope:'community-publish',subject:args.userId,windowMs:60000,max:10}))throw new Error('Publication limit reached');
  if(await isBanned(ctx,args.userId))throw new Error('This community account is suspended');
  const parsed=parseSnapshot(args.snapshot);
  if(isObjectionable(...snapshotTexts(parsed)))throw new Error(FILTER_MESSAGE);
  const snapshot=args.photoId?withoutPhoto(parsed):parsed;
  const searchText=[snapshot.title,snapshot.description||'',...snapshot.tags].join(' ');
  if(args.sourceKey && !/^[a-f0-9]{64}$/.test(args.sourceKey))throw new Error('Invalid publication key');
  const existing=args.sourceKey?await ctx.db.query('hubRecipes').withIndex('by_userId_and_sourceKey',q=>q.eq('userId',args.userId).eq('sourceKey',args.sourceKey)).unique():null;
  const targetId=args.id||existing?._id;
  const photo={photoId:args.photoId,photoType:args.photoId?args.photoType:undefined};
  if(targetId){
    const recipe=await ctx.db.get(targetId);
    if(!recipe || recipe.userId!==args.userId)throw new Error('Permission denied');
    if(recipe.removedAt)throw new Error('This recipe was removed by a moderator');
    const revision=recipe.revision+1;
    // `underReview` is left alone: republishing doesn't lift a review.
    await ctx.db.patch(targetId,{snapshot,visibility:args.visibility,revision,updatedAt:Date.now(),searchText,...photo});
    if(recipe.photoId!==args.photoId)await deletePhoto(ctx,recipe.photoId);
    await syncRecipe(ctx,targetId);
    return {id:targetId,revision};
  }
  const id=await ctx.db.insert('hubRecipes',{userId:args.userId,sourceKey:args.sourceKey,snapshot,visibility:args.visibility,revision:1,updatedAt:Date.now(),searchText,...photo,likeCount:0,saveCount:0,madeCount:0,ratingSum:0});
  await syncRecipe(ctx,id);
  return {id,revision:1};
}});
export const unpublish=internalMutation({args:{userId:v.id('users'),id:v.id('hubRecipes')},returns:v.null(),handler:async(ctx,{userId,id})=>{const recipe=await ctx.db.get(id);if(!recipe || recipe.userId!==userId)throw new Error('Permission denied');await ctx.db.patch(id,{visibility:'private'});await syncRecipe(ctx,id);return null;}});
export { hash as hashCommunityToken };
