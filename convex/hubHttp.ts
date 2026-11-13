import { httpAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { parseSnapshot, type RecipeSnapshot } from '../src/lib/community-contract';
import { FILTER_MESSAGE, isObjectionable, snapshotTexts } from '../src/lib/community-filter';
import { V1_PHOTO_BUDGET } from './hub';
import { BodyTooLarge, bearerUser, dataUrlLength, decodeDataUrl, json, readBoundedJson, toDataUrl } from './httpUtil';

type StoredPhoto={id:Id<'_storage'>;type:string;size:number};
type V1Recipe={id:string;revision:number;createdAt:string;author:{id:string;name:string};snapshot:RecipeSnapshot;photo?:StoredPhoto};

/**
 * Puts stored photos back into `snapshot.photoDataUrl`, as API v1 clients
 * expect, until the photos in one response would pass `budget` characters.
 */
async function inlinePhotos(ctx:ActionCtx,recipes:V1Recipe[],budget:number){
  let used=recipes.reduce((sum,recipe)=>sum+(recipe.snapshot.photoDataUrl?.length??0),0);
  return Promise.all(recipes.map(async({photo,...recipe})=>{
    if(!photo)return recipe;
    const length=dataUrlLength(photo.size,photo.type);
    if(used+length>budget)return recipe;
    used+=length;
    const blob=await ctx.storage.get(photo.id);
    return blob?{...recipe,snapshot:{...recipe.snapshot,photoDataUrl:await toDataUrl(blob,photo.type)}}:recipe;
  }));
}

export const browse=httpAction(async(ctx,request)=>{
  try{const url=new URL(request.url);const path=url.pathname.slice('/api/v1/recipes'.length);
    if(path){
      const recipe:V1Recipe|null=await ctx.runQuery(internal.hub.getV1,{id:decodeURIComponent(path.slice(1)).slice(0,64)});
      return recipe?json((await inlinePhotos(ctx,[recipe],Infinity))[0]):json({error:'Not found'},404);
    }
    const {recipes}:{recipes:V1Recipe[]}=await ctx.runQuery(internal.hub.listV1,{search:url.searchParams.get('search')||undefined,limit:Number(url.searchParams.get('limit')||20)});
    return json({recipes:await inlinePhotos(ctx,recipes,V1_PHOTO_BUDGET)});
  }catch{return json({error:'Invalid recipe request'},400);}
});

/** Moves the snapshot's photo to file storage, then publishes; the stored file is dropped again if publishing fails. */
async function publish(ctx:ActionCtx,userId:Id<'users'>,body:{id?:Id<'hubRecipes'>;sourceKey?:string;snapshot?:unknown;visibility:'public'|'unlisted'}){
  const snapshot=parseSnapshot(body.snapshot);
  if(isObjectionable(...snapshotTexts(snapshot)))return json({error:FILTER_MESSAGE},400);
  let photoId:Id<'_storage'>|undefined;let photoType:string|undefined;
  if(snapshot.photoDataUrl){
    const photo=decodeDataUrl(snapshot.photoDataUrl);
    if(!photo)throw new Error('Invalid recipe photo');
    photoId=await ctx.storage.store(new Blob([photo.bytes],{type:photo.type}));photoType=photo.type;
    delete snapshot.photoDataUrl;
  }
  try{
    return json(await ctx.runMutation(internal.hub.publish,{userId,id:body.id,sourceKey:body.sourceKey,snapshot,visibility:body.visibility,photoId,photoType}));
  }catch(error){
    if(photoId)await ctx.storage.delete(photoId);
    throw error;
  }
}

export const write=httpAction(async(ctx,request)=>{
  const userId=await bearerUser(ctx,request);if(!userId)return json({error:'Not authenticated'},401);
  try {
    // Mutation validators check these fields at runtime.
    const body=await readBoundedJson(request,800000) as {id?:Id<'hubRecipes'>;sourceKey?:string;snapshot?:unknown;visibility:'public'|'unlisted'};const path=new URL(request.url).pathname;
    if(path==='/api/v1/me')return json({userId});
    if(path==='/api/v1/publish')return await publish(ctx,userId,body);
    if(path==='/api/v1/unpublish'){await ctx.runMutation(internal.hub.unpublish,{userId,id:body.id!});return json({success:true});}
    return json({error:'Not found'},404);
  }catch(error){if(error instanceof BodyTooLarge)return json({error:'Recipe too large'},413);return json({error:'Publication rejected'},400);}
});
