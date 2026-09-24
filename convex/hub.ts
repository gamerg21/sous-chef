import { v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { getAuthUserId } from './helpers';
import { snapshotValidator, parseSnapshot } from '../src/lib/community-contract';
import { checkAndRecordRateLimit } from './rateLimit';
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const TOKEN_LIFETIME_MS=90*86400000;
const MAX_TOKENS=20;
/** A new random publisher token; only its hash is stored. */
export const newPublisherToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
/** Stores a publisher token hash. `replaceOldest` retires the oldest token at the limit instead of refusing. */
/** True when a moderator banned this cook. */
export async function isBanned(ctx:QueryCtx,userId:Id<'users'>){return !!await ctx.db.query('hubBans').withIndex('by_userId',q=>q.eq('userId',userId)).first();}
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
export const list=query({args:{search:v.optional(v.string()),limit:v.optional(v.number())},returns:v.any(),handler:async(ctx,args)=>{
  const limit=Math.max(1,Math.min(50,Math.floor(args.limit||20)));
  const rows=args.search?.trim()?await ctx.db.query('hubRecipes').withSearchIndex('search_recipes',q=>q.search('searchText',args.search!.slice(0,200)).eq('visibility','public')).take(limit):await ctx.db.query('hubRecipes').withIndex('by_visibility',q=>q.eq('visibility','public')).order('desc').take(limit);
  return {recipes:await Promise.all(rows.map(async recipe=>({id:recipe._id,revision:recipe.revision,createdAt:new Date(recipe._creationTime).toISOString(),author:{id:recipe.userId,name:(await ctx.db.get(recipe.userId))?.name||'Community cook'},snapshot:recipe.snapshot})))};
}});
export const get=query({args:{id:v.id('hubRecipes')},returns:v.any(),handler:async(ctx,{id})=>{
  const recipe=await ctx.db.get(id);if(!recipe || recipe.visibility==='private')return null;
  return {id:recipe._id,revision:recipe.revision,createdAt:new Date(recipe._creationTime).toISOString(),author:{id:recipe.userId,name:(await ctx.db.get(recipe.userId))?.name||'Community cook'},snapshot:recipe.snapshot};
}});
export const identify=internalQuery({args:{hash:v.string()},returns:v.union(v.id('users'),v.null()),handler:async(ctx,{hash})=>{const token=await ctx.db.query('hubTokens').withIndex('by_hash',q=>q.eq('hash',hash)).unique();return token && token.expires>Date.now() && await ctx.db.get(token.userId) && !await isBanned(ctx,token.userId)?token.userId:null;}});
export const publish=internalMutation({args:{userId:v.id('users'),id:v.optional(v.id('hubRecipes')),sourceKey:v.optional(v.string()),snapshot:snapshotValidator,visibility:v.union(v.literal('public'),v.literal('unlisted'))},returns:v.object({id:v.id('hubRecipes'),revision:v.number()}),handler:async(ctx,args)=>{
  if(!await checkAndRecordRateLimit(ctx,{scope:'community-publish',subject:args.userId,windowMs:60000,max:10}))throw new Error('Publication limit reached');
  if(await isBanned(ctx,args.userId))throw new Error('This community account is suspended');
  const snapshot=parseSnapshot(args.snapshot);const searchText=[snapshot.title,snapshot.description||'',...snapshot.tags].join(' ');
  if(args.sourceKey && !/^[a-f0-9]{64}$/.test(args.sourceKey))throw new Error('Invalid publication key');
  const existing=args.sourceKey?await ctx.db.query('hubRecipes').withIndex('by_userId_and_sourceKey',q=>q.eq('userId',args.userId).eq('sourceKey',args.sourceKey)).unique():null;
  const targetId=args.id||existing?._id;
  if(targetId){const recipe=await ctx.db.get(targetId);if(!recipe || recipe.userId!==args.userId)throw new Error('Permission denied');if(recipe.removedAt)throw new Error('This recipe was removed by a moderator');const revision=recipe.revision+1;await ctx.db.patch(targetId,{snapshot,visibility:args.visibility,revision,updatedAt:Date.now(),searchText});return {id:targetId,revision};}
  const id=await ctx.db.insert('hubRecipes',{userId:args.userId,sourceKey:args.sourceKey,snapshot,visibility:args.visibility,revision:1,updatedAt:Date.now(),searchText});return {id,revision:1};
}});
export const unpublish=internalMutation({args:{userId:v.id('users'),id:v.id('hubRecipes')},returns:v.null(),handler:async(ctx,{userId,id})=>{const recipe=await ctx.db.get(id);if(!recipe || recipe.userId!==userId)throw new Error('Permission denied');await ctx.db.patch(id,{visibility:'private'});return null;}});
export { hash as hashCommunityToken };
