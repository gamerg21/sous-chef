import { createHash } from 'node:crypto';
import { v } from 'convex/values';
import { action, query, mutation, internalQuery, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId, getHouseholdMembership, ensureUserHasHousehold, decodeIngredientMapping } from './helpers';
import { encryptSecret, decryptSecret } from './secrets';
import { communityRecipe, parseSnapshot, COMMUNITY_LIMITS, REPORT_REASONS, type Publication, type RecipeSnapshot, type Cook, type Listing, type LocalDetail, type LocalListing, type Me, type OwnListing, type Report, type Tip } from '../../lib/community-contract';
import { isObjectionable, snapshotTexts, FILTER_MESSAGE } from '../../lib/community-filter';
import { comparePantry, ingredientKey, matchPantry, pantryKeys } from '../../lib/pantry-match';
import { pantryFor } from './cooking';
import { getCurrentHouseholdId } from './helpers';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { communityOrigin, isCurrentOrigin, remoteV2, CommunityError, NOT_CONNECTED, RECONNECT, parseCook, parseDetail, parseFollow, parseLike, parseListings, parseMadeTotals, parseMe, parseOwnListings, parseReports, parseRevisions, parseSuccess, parseTags, parseTips } from './communityRemote';

export { communityOrigin };
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
  // A remote note must not pose as a legacy "MAPPING:" marker.
  for(const [order,ingredient]of s.ingredients.entries())await ctx.db.insert('recipeIngredients',{recipeId,order,...ingredient,note:ingredient.note?.replace(/^(\s*MAPPING:)+/i,'').trim() || undefined});
  for(const [order,step]of s.steps.entries())await ctx.db.insert('recipeSteps',{recipeId,order,text:step.text});
  if(s.photoDataUrl){const match=/^data:([^;]+);base64,(.*)$/.exec(s.photoDataUrl)!;const id=ctx.files.store(match[1],Buffer.from(match[2],'base64'));const url=`/api/files/${id}`;await ctx.db.patch(recipeId,{photoUrl:url});await ctx.db.insert('mediaAssets',{url,recipeId});}
  await ctx.db.insert('recipeOrigins',{recipeId,remoteId:publication.id,revision:publication.revision,origin:communityOrigin()!,author:publication.author.name});return {savedRecipeId:recipeId};
}});
export const saveRecipe=action({args:{recipeId:v.string()},handler:async(ctx,{recipeId}):Promise<{savedRecipeId:string}>=>{
  const publication=await remote<Publication>(`recipes/${encodeURIComponent(recipeId)}`);parseSnapshot(publication.snapshot);
  const saved=await ctx.runMutation(internal.community.importPublication,{publication});
  // Counted once per local account by the community; the copy is saved whether or not this arrives.
  try {const key=clientKey('save',ctx.userId);if(key)await remoteV2('save',{body:{id:recipeId,clientKey:key},timeoutMs:5000});} catch {}
  return saved;
}});


// ── Community API v2 (docs/COMMUNITY_API.md, "Local kitchen operations") ──
const HIDDEN_LIMIT=2000;
const text=(max:number)=>(value:string|undefined,name:string)=>{if(value!==undefined && value.length>max)throw new Error(`${name} is too long`);return value;};
const shortText=text(200),cursorText=text(2000);
/** Identifies this local account to the community without revealing its ID; differs per purpose so saves and reports can't be linked. */
function clientKey(purpose:'save'|'report',userId:string|null):string|undefined {
  const secret=process.env.SECRETS_ENCRYPTION_KEY;if(!secret || !userId)return undefined;
  return createHash('sha256').update(`${secret}:community-${purpose}:${userId}`).digest('hex');
}
const configured=()=>{try{return !!communityOrigin();}catch{return false;}};
const unreachable=(error:unknown)=>error instanceof CommunityError && error.code==='unreachable';
const pathId=(value:string)=>{if(!value || value.length>200)throw new Error('Invalid ID');return encodeURIComponent(value);};

/** The caller's account, stored connection and hide lists. Every v2 operation starts here, so each one authenticates. */
export const viewer=internalQuery({args:{},handler:async ctx=>{
  const userId=await getAuthUserId(ctx);
  const connection=await ctx.db.query('communityConnections').withIndex('by_userId',q=>q.eq('userId',userId)).unique();
  const hidden=await ctx.db.query('communityHidden').withIndex('by_userId',q=>q.eq('userId',userId)).collect();
  return {userId,token:connection?.token??null,recipes:hidden.filter(h=>h.kind==='recipe').map(h=>h.key),authors:hidden.filter(h=>h.kind==='author').map(h=>h.key),tips:hidden.filter(h=>h.kind==='tip').map(h=>h.key)};
}});
type Session={userId:Id<'users'>;token?:string;recipes:Set<string>;authors:Set<string>;tips:Set<string>};
async function session(ctx:ActionCtx):Promise<Session> {
  const local=await ctx.runQuery(internal.community.viewer,{});
  let token:string|undefined;
  if(local.token){try{token=await decryptSecret(local.token);}catch{throw new Error(RECONNECT);}}
  return {userId:local.userId,token,recipes:new Set(local.recipes),authors:new Set(local.authors),tips:new Set(local.tips)};
}
/** For operations that act as the caller's community account. */
async function account(ctx:ActionCtx):Promise<Session&{token:string}> {
  const me=await session(ctx);if(!me.token)throw new Error(NOT_CONNECTED);return me as Session&{token:string};
}

/** The household's copy of a community recipe, if it has one. */
async function savedCopyOf(ctx:QueryCtx,householdId:Id<'households'>,remoteId:string) {
  for(const origin of await ctx.db.query('recipeOrigins').withIndex('by_remoteId',q=>q.eq('remoteId',remoteId)).collect()) {
    if(!isCurrentOrigin(origin.origin))continue;
    const recipe=await ctx.db.get(origin.recipeId);if(recipe?.householdId===householdId)return recipe;
  }
  return null;
}
/** What this kitchen knows about some community recipes: saved copies, and in-stock names when asked. Stays on this server. */
export const localMatches=internalQuery({args:{ids:v.array(v.string()),pantry:v.optional(v.boolean())},handler:async(ctx,{ids,pantry})=>{
  const userId=await getAuthUserId(ctx);const householdId=await getCurrentHouseholdId(ctx,userId);
  const saved:[string,string][]=[];
  if(householdId)for(const id of new Set(ids)){const recipe=await savedCopyOf(ctx,householdId,id);if(recipe)saved.push([id,recipe._id]);}
  const stock=pantry && householdId?(await pantryFor(ctx,householdId)).filter(item=>item.quantity>0).map(item=>item.name):[];
  return {saved,stock};
}});

const shown=(me:Session,listing:Listing)=>!me.recipes.has(listing.id) && !me.authors.has(listing.author.id) && !isObjectionable(listing.title,listing.description,...listing.tags,listing.author.name);
const shownTip=(me:Session,tip:Tip)=>!me.tips.has(tip.id) && !me.authors.has(tip.author.id) && !isObjectionable(tip.tip,tip.author.name);
async function localListings(ctx:ActionCtx,me:Session,listings:Listing[],pantry:boolean):Promise<LocalListing[]> {
  const visible=listings.filter(listing=>shown(me,listing));
  const local=await ctx.runQuery(internal.community.localMatches,{ids:visible.map(l=>l.id),pantry});
  const saved=new Map(local.saved);const stock=pantryKeys(local.stock);
  return visible.map(listing=>({...listing,saved:saved.has(listing.id),...(pantry?{pantry:matchPantry(listing.ingredientNames,stock)}:{})}));
}
type Feed={recipes:LocalListing[];cursor:string|null;available:boolean};
const NO_FEED:Feed={recipes:[],cursor:null,available:false};
const pageSize=(limit?:number)=>Math.min(Math.max(Math.trunc(limit??20) || 20,1),50);

export const feed=action({args:{sort:v.optional(v.union(v.literal('new'),v.literal('hot'),v.literal('top'))),tag:v.optional(v.string()),search:v.optional(v.string()),author:v.optional(v.string()),cursor:v.optional(v.string()),limit:v.optional(v.number()),pantry:v.optional(v.boolean())},handler:async(ctx,args):Promise<Feed>=>{
  const me=await session(ctx);if(!configured())return NO_FEED;
  shortText(args.tag,'Tag');shortText(args.search,'Search');shortText(args.author,'Cook');cursorText(args.cursor,'Cursor');
  const page=async(cursor:string|undefined,limit:number)=>{
    const query=new URLSearchParams();
    for(const [key,value] of Object.entries({sort:args.sort,tag:args.tag,search:args.search,author:args.author,cursor}))if(value)query.set(key,value);
    query.set('limit',String(limit));
    return parseListings(await remoteV2(`recipes?${query}`,{token:me.token,tokenOptional:true}));
  };
  try {
    if(!args.pantry){const result=await page(args.cursor,pageSize(args.limit));return {recipes:await localListings(ctx,me,result.recipes,false),cursor:result.cursor,available:true};}
    // Pantry order needs the whole candidate set at once: up to 100 listings, at most four pages.
    const listings:Listing[]=[];let cursor=args.cursor;
    for(let pages=0;pages<4 && listings.length<100;pages++){const result=await page(cursor,50);listings.push(...result.recipes);if(!result.cursor)break;cursor=result.cursor;}
    const unique=[...new Map(listings.map(l=>[l.id,l])).values()].slice(0,100);
    const recipes=await localListings(ctx,me,unique,true);
    return {recipes:recipes.sort((a,b)=>comparePantry(a.pantry!,b.pantry!)),cursor:null,available:true};
  } catch(error){if(unreachable(error))return NO_FEED;throw error;}
}});
export const followingFeed=action({args:{cursor:v.optional(v.string()),limit:v.optional(v.number())},handler:async(ctx,args):Promise<Feed>=>{
  const me=await session(ctx);if(!configured())return NO_FEED;if(!me.token)throw new Error(NOT_CONNECTED);
  cursorText(args.cursor,'Cursor');
  try {const result=parseListings(await remoteV2('feed/following',{body:{...(args.cursor?{cursor:args.cursor}:{}),limit:pageSize(args.limit)},token:me.token}));return {recipes:await localListings(ctx,me,result.recipes,false),cursor:result.cursor,available:true};}
  catch(error){if(unreachable(error))return NO_FEED;throw error;}
}});
export const recipe=action({args:{id:v.string()},handler:async(ctx,{id}):Promise<LocalDetail>=>{
  const me=await session(ctx);
  const detail=parseDetail(await remoteV2(`recipes/${pathId(id)}`,{token:me.token,tokenOptional:true}));
  if(detail.id!==id || !shown(me,detail) || isObjectionable(...snapshotTexts(detail.snapshot)))throw new Error("This recipe isn't available");
  const local=await ctx.runQuery(internal.community.localMatches,{ids:[detail.id],pantry:true});
  const savedRecipeId=new Map(local.saved).get(detail.id);
  const names=detail.ingredientNames.length?detail.ingredientNames:detail.snapshot.ingredients.map(i=>i.name);
  return {...detail,tips:detail.tips.filter(tip=>shownTip(me,tip)),saved:!!savedRecipeId,...(savedRecipeId?{savedRecipeId}:{}),pantry:matchPantry(names,pantryKeys(local.stock))};
}});
export const tips=action({args:{id:v.string(),cursor:v.optional(v.string())},handler:async(ctx,{id,cursor}):Promise<{tips:Tip[];cursor:string|null}>=>{
  const me=await session(ctx);cursorText(cursor,'Cursor');
  const result=parseTips(await remoteV2(`recipes/${pathId(id)}/tips${cursor?`?${new URLSearchParams({cursor})}`:''}`));
  return {tips:result.tips.filter(tip=>shownTip(me,tip)),cursor:result.cursor};
}});
export const tags=action({args:{},handler:async(ctx):Promise<{tags:{tag:string;count:number}[]}>=>{
  await session(ctx);if(!configured())return {tags:[]};
  try {return {tags:parseTags(await remoteV2('tags')).tags.filter(entry=>!isObjectionable(entry.tag))};}
  catch(error){if(unreachable(error))return {tags:[]};throw error;}
}});
export const cook=action({args:{id:v.string()},handler:async(ctx,{id}):Promise<Cook&{blocked:boolean}>=>{
  const me=await session(ctx);
  const result=parseCook(await remoteV2(`cooks/${pathId(id)}`,{token:me.token,tokenOptional:true}));
  if(result.id!==id || isObjectionable(result.name))throw new Error("This cook isn't available");
  if(isObjectionable(result.bio))delete result.bio;
  return {...result,blocked:me.authors.has(result.id)};
}});
export const me=action({args:{},handler:async(ctx):Promise<{configured:boolean;connected:boolean;me:Me|null}>=>{
  const local=await ctx.runQuery(internal.community.viewer,{});
  const state={configured:configured(),connected:!!local.token};
  if(!state.configured || !local.token)return {...state,me:null};
  // An unreachable service or a revoked token leaves `me` empty rather than failing the page.
  try {return {...state,me:parseMe(await remoteV2('me',{body:{},token:await decryptSecret(local.token)}))};}
  catch {return {...state,me:null};}
}});
export const updateProfile=action({args:{name:v.optional(v.string()),bio:v.optional(v.string())},handler:async(ctx,args):Promise<Me>=>{
  const me=await account(ctx);
  const name=args.name?.trim(),bio=args.bio?.trim();
  if(name!==undefined && (!name || name.length>COMMUNITY_LIMITS.name))throw new Error(`Name must be 1–${COMMUNITY_LIMITS.name} characters`);
  if(bio!==undefined && bio.length>COMMUNITY_LIMITS.bio)throw new Error(`Bio must be ${COMMUNITY_LIMITS.bio} characters or fewer`);
  if(isObjectionable(name,bio))throw new Error(FILTER_MESSAGE);
  return parseMe(await remoteV2('me/profile',{body:{...(name!==undefined?{name}:{}),...(bio!==undefined?{bio}:{})},token:me.token}));
}});
export const myRecipes=action({args:{cursor:v.optional(v.string())},handler:async(ctx,{cursor}):Promise<{recipes:OwnListing[];cursor:string|null}>=>{
  const me=await account(ctx);cursorText(cursor,'Cursor');
  return parseOwnListings(await remoteV2('me/recipes',{body:cursor?{cursor}:{},token:me.token}));
}});
export const like=action({args:{id:v.string(),liked:v.boolean()},handler:async(ctx,{id,liked}):Promise<{liked:boolean;likeCount:number}>=>{
  const me=await account(ctx);shortText(id,'ID');
  return parseLike(await remoteV2('like',{body:{id,liked},token:me.token}));
}});
export const made=action({args:{id:v.string(),rating:v.number(),tip:v.optional(v.string())},handler:async(ctx,args):Promise<{madeCount:number;rating?:number}>=>{
  const me=await account(ctx);shortText(args.id,'ID');
  if(!Number.isInteger(args.rating) || args.rating<1 || args.rating>5)throw new Error('Rating must be a whole number from 1 to 5');
  const tip=args.tip?.trim() || undefined;
  if(tip && tip.length>COMMUNITY_LIMITS.tip)throw new Error(`Tip must be ${COMMUNITY_LIMITS.tip} characters or fewer`);
  if(isObjectionable(tip))throw new Error(FILTER_MESSAGE);
  return parseMadeTotals(await remoteV2('made',{body:{id:args.id,rating:args.rating,...(tip?{tip}:{})},token:me.token}));
}});
export const removeMade=action({args:{id:v.string()},handler:async(ctx,{id}):Promise<{madeCount:number;rating?:number}>=>{
  const me=await account(ctx);shortText(id,'ID');
  return parseMadeTotals(await remoteV2('made/delete',{body:{id},token:me.token}));
}});
export const follow=action({args:{userId:v.string(),following:v.boolean()},handler:async(ctx,{userId,following}):Promise<{following:boolean;followerCount:number}>=>{
  const me=await account(ctx);shortText(userId,'ID');
  return parseFollow(await remoteV2('follow',{body:{userId,following},token:me.token}));
}});

async function setHidden(ctx:MutationCtx,userId:Id<'users'>,entry:{kind:'recipe'|'author'|'tip';key:string;label:string;hidden:boolean}) {
  const key=entry.key.trim(),label=entry.label.trim().slice(0,200);
  if(!key || key.length>200)throw new Error('Invalid ID');
  const existing=await ctx.db.query('communityHidden').withIndex('by_userId_and_kind_and_key',q=>q.eq('userId',userId).eq('kind',entry.kind).eq('key',key)).collect();
  if(!entry.hidden){for(const row of existing)await ctx.db.delete(row._id);return;}
  if(existing.length){if(label && existing[0].label!==label)await ctx.db.patch(existing[0]._id,{label});return;}
  if((await ctx.db.query('communityHidden').withIndex('by_userId',q=>q.eq('userId',userId)).take(HIDDEN_LIMIT)).length>=HIDDEN_LIMIT)throw new Error('Your hidden list is full. Unhide something first');
  await ctx.db.insert('communityHidden',{userId,kind:entry.kind,key,label});
}
export const hide=mutation({args:{kind:v.union(v.literal('recipe'),v.literal('author')),key:v.string(),label:v.string(),hidden:v.boolean()},handler:async(ctx,args)=>{
  await setHidden(ctx,await getAuthUserId(ctx),args);return {success:true as const};
}});
export const hidden=query({args:{},handler:async ctx=>{
  const userId=await getAuthUserId(ctx);
  const rows=await ctx.db.query('communityHidden').withIndex('by_userId',q=>q.eq('userId',userId)).collect();
  const of=(kind:'recipe'|'author')=>rows.filter(row=>row.kind===kind).map(row=>({key:row.key,label:row.label}));
  return {recipes:of('recipe'),authors:of('author')};
}});
/** Hides what was reported for its reporter: the one tip, or the recipe (labelled with the kitchen's saved copy when there is one). */
export const hideReported=internalMutation({args:{recipeId:v.string(),tipId:v.optional(v.string())},handler:async(ctx,{recipeId,tipId})=>{
  const userId=await getAuthUserId(ctx);const householdId=await getCurrentHouseholdId(ctx,userId);
  if(tipId){await setHidden(ctx,userId,{kind:'tip',key:tipId,label:'Reported tip',hidden:true});return {success:true as const};}
  const copy=householdId?await savedCopyOf(ctx,householdId,recipeId):null;
  await setHidden(ctx,userId,{kind:'recipe',key:recipeId,label:copy?.title || 'Reported recipe',hidden:true});return {success:true as const};
}});
export const report=action({args:{recipeId:v.string(),tipId:v.optional(v.string()),reason:v.union(...REPORT_REASONS.map(reason=>v.literal(reason))),note:v.optional(v.string())},handler:async(ctx,args):Promise<{success:true}>=>{
  const me=await session(ctx);shortText(args.recipeId,'ID');shortText(args.tipId,'ID');
  const note=args.note?.trim() || undefined;
  if(note && note.length>COMMUNITY_LIMITS.reportNote)throw new Error(`Note must be ${COMMUNITY_LIMITS.reportNote} characters or fewer`);
  const key=clientKey('report',me.userId);
  parseSuccess(await remoteV2('report',{body:{recipeId:args.recipeId,...(args.tipId?{tipId:args.tipId}:{}),reason:args.reason,...(note?{note}:{}),...(key?{clientKey:key}:{})},token:me.token,tokenOptional:true}));
  return ctx.runMutation(internal.community.hideReported,{recipeId:args.recipeId,...(args.tipId?{tipId:args.tipId}:{})});
}});

// ── Updates to saved copies ─────────────────────────────────────────────
/** The current household's copies saved from this community. */
export const savedCopies=internalQuery({args:{},handler:async ctx=>{
  const userId=await getAuthUserId(ctx);const householdId=await getCurrentHouseholdId(ctx,userId);
  const copies:{recipeId:Id<'recipes'>;title:string;remoteId:string;savedRevision:number;dismissedRevision?:number}[]=[];
  if(!householdId || !configured())return copies;
  for(const recipe of await ctx.db.query('recipes').withIndex('by_householdId',q=>q.eq('householdId',householdId)).collect()) {
    const origin=await ctx.db.query('recipeOrigins').withIndex('by_recipeId',q=>q.eq('recipeId',recipe._id)).first();
    if(origin && isCurrentOrigin(origin.origin))copies.push({recipeId:recipe._id,title:recipe.title,remoteId:origin.remoteId,savedRevision:origin.revision,dismissedRevision:origin.dismissedRevision});
  }
  return copies;
}});
async function latestRevisions(remoteIds:string[]):Promise<Map<string,number|null>> {
  // The list is comma-separated, so an ID with a comma can't be asked about; community IDs never have one.
  const ids=[...new Set(remoteIds)].filter(id=>id && !id.includes(','));const latest=new Map<string,number|null>();
  for(let start=0;start<ids.length;start+=100) {
    const batch=ids.slice(start,start+100);
    for(const [id,revision] of parseRevisions(await remoteV2(`revisions?ids=${batch.map(encodeURIComponent).join(',')}`),batch))latest.set(id,revision);
  }
  return latest;
}
type Update={recipeId:string;title:string;remoteId:string;savedRevision:number;latestRevision:number};
export const updates=action({args:{},handler:async(ctx):Promise<{updates:Update[]}>=>{
  const copies=(await ctx.runQuery(internal.community.savedCopies,{})).slice(0,1000);
  if(!copies.length)return {updates:[]};
  let latest:Map<string,number|null>;
  try {latest=await latestRevisions(copies.map(copy=>copy.remoteId));} catch(error){if(unreachable(error))return {updates:[]};throw error;}
  return {updates:copies.flatMap(copy=>{
    const revision=latest.get(copy.remoteId);
    return typeof revision==='number' && revision>copy.savedRevision && revision>(copy.dismissedRevision??0)?[{recipeId:copy.recipeId,title:copy.title,remoteId:copy.remoteId,savedRevision:copy.savedRevision,latestRevision:revision}]:[];
  })};
}});
/** A saved copy the caller's household owns, with where it came from. */
async function ownedCopy(ctx:QueryCtx,recipeId:Id<'recipes'>) {
  const userId=await getAuthUserId(ctx);const recipe=await ctx.db.get(recipeId);
  if(!recipe || !await getHouseholdMembership(ctx,userId,recipe.householdId))throw new Error('Permission denied');
  const origin=await ctx.db.query('recipeOrigins').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).first();
  if(!origin || !isCurrentOrigin(origin.origin))throw new Error("This recipe wasn't saved from this community");
  return {recipe,origin};
}
export const savedCopy=internalQuery({args:{recipeId:v.id('recipes')},handler:async(ctx,{recipeId})=>{
  const {origin}=await ownedCopy(ctx,recipeId);return {remoteId:origin.remoteId,revision:origin.revision};
}});
/** Replaces what a community snapshot carries and nothing else, in one transaction. */
export const applyRevision=internalMutation({args:{recipeId:v.id('recipes'),remoteId:v.string(),revision:v.number(),snapshot:v.any(),keepPhoto:v.boolean()},handler:async(ctx,args)=>{
  const s=parseSnapshot(args.snapshot);const {recipe,origin}=await ownedCopy(ctx,args.recipeId);const recipeId=recipe._id;
  if(origin.remoteId!==args.remoteId)throw new Error("This recipe wasn't saved from this community");
  if(args.revision<=origin.revision)return {success:true as const};
  await ctx.db.patch(recipeId,{title:s.title,description:s.description,tags:s.tags,servings:s.servings,totalTimeMinutes:s.totalTimeMinutes});
  // Pantry mappings are the kitchen's own; an ingredient that keeps its name keeps its mapping.
  const kept=new Map<string,{mappingLabel?:string;foodItemId?:Id<'foodItems'>}>();
  for(const old of await ctx.db.query('recipeIngredients').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).collect()){kept.set(ingredientKey(old.name),{mappingLabel:decodeIngredientMapping(old).mappingLabel,foodItemId:old.foodItemId});await ctx.db.delete(old._id);}
  // A remote note must not pose as a legacy "MAPPING:" marker.
  for(const [order,ingredient] of s.ingredients.entries())await ctx.db.insert('recipeIngredients',{recipeId,order,name:ingredient.name,quantity:ingredient.quantity,unit:ingredient.unit,note:ingredient.note?.replace(/^(\s*MAPPING:)+/i,'').trim() || undefined,...kept.get(ingredientKey(ingredient.name))});
  for(const old of await ctx.db.query('recipeSteps').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).collect())await ctx.db.delete(old._id);
  for(const [order,step] of s.steps.entries())await ctx.db.insert('recipeSteps',{recipeId,order,text:step.text});
  const replaced=recipe.photoUrl;
  if(s.photoDataUrl) {
    const match=/^data:([^;]+);base64,(.*)$/.exec(s.photoDataUrl)!;const url=`/api/files/${ctx.files.store(match[1],Buffer.from(match[2],'base64'))}`;
    await ctx.db.patch(recipeId,{photoUrl:url});await dropPhoto(ctx,recipeId,replaced);await ctx.db.insert('mediaAssets',{url,recipeId});
  } else if(!args.keepPhoto && replaced){await ctx.db.patch(recipeId,{photoUrl:undefined});await dropPhoto(ctx,recipeId,replaced);}
  await ctx.db.patch(origin._id,{revision:args.revision,dismissedRevision:undefined});
  return {success:true as const};
}});
/** Removes a recipe's replaced photo: the stored file, unless something else still shows it, and its media rows. */
async function dropPhoto(ctx:MutationCtx,recipeId:Id<'recipes'>,url?:string) {
  if(!url)return;
  if(url.startsWith('/api/files/'))ctx.files.remove(url.split('/').pop()!);
  for(const asset of await ctx.db.query('mediaAssets').withIndex('by_recipeId',q=>q.eq('recipeId',recipeId)).collect())if(asset.url===url)await ctx.db.delete(asset._id);
}
export const applyUpdate=action({args:{recipeId:v.id('recipes')},handler:async(ctx,{recipeId}):Promise<{success:true}>=>{
  const copy=await ctx.runQuery(internal.community.savedCopy,{recipeId});
  const detail=parseDetail(await remoteV2(`recipes/${pathId(copy.remoteId)}?photo=inline`));
  if(detail.id!==copy.remoteId)throw new CommunityError('The community service sent a response this server could not read','invalid');
  if(isObjectionable(...snapshotTexts(detail.snapshot)))throw new Error(FILTER_MESSAGE);
  // A listed photo that didn't arrive inline is not a removed photo: keep the copy's own.
  return ctx.runMutation(internal.community.applyRevision,{recipeId,remoteId:copy.remoteId,revision:detail.revision,snapshot:detail.snapshot,keepPhoto:!!detail.photoUrl && !detail.snapshot.photoDataUrl});
}});
export const recordDismissal=internalMutation({args:{recipeId:v.id('recipes'),revision:v.number()},handler:async(ctx,{recipeId,revision})=>{
  const {origin}=await ownedCopy(ctx,recipeId);
  if(revision>origin.revision && revision>(origin.dismissedRevision??0))await ctx.db.patch(origin._id,{dismissedRevision:revision});
  return {success:true as const};
}});
export const dismissUpdate=action({args:{recipeId:v.id('recipes')},handler:async(ctx,{recipeId}):Promise<{success:true}>=>{
  const copy=await ctx.runQuery(internal.community.savedCopy,{recipeId});
  const revision=(await latestRevisions([copy.remoteId])).get(copy.remoteId);
  if(typeof revision!=='number')return {success:true};
  return ctx.runMutation(internal.community.recordDismissal,{recipeId,revision});
}});

// ── Moderators: the community checks the role; this server only forwards. ──
export const modReports=action({args:{status:v.optional(v.union(v.literal('open'),v.literal('actioned'),v.literal('dismissed'))),cursor:v.optional(v.string())},handler:async(ctx,{status,cursor}):Promise<{reports:Report[];cursor:string|null}>=>{
  const me=await account(ctx);cursorText(cursor,'Cursor');
  return parseReports(await remoteV2('mod/reports',{body:{...(status?{status}:{}),...(cursor?{cursor}:{})},token:me.token}));
}});
export const modResolve=action({args:{reportId:v.string(),action:v.union(v.literal('dismiss'),v.literal('remove_recipe'),v.literal('remove_tip'),v.literal('ban_user')),reason:v.optional(v.string())},handler:async(ctx,args):Promise<{success:true}>=>{
  const me=await account(ctx);shortText(args.reportId,'ID');
  const reason=text(500)(args.reason?.trim() || undefined,'Reason');
  return parseSuccess(await remoteV2('mod/resolve',{body:{reportId:args.reportId,action:args.action,...(reason?{reason}:{})},token:me.token}));
}});
