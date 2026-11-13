import { v, type Infer } from 'convex/values';
import { validate, descriptor } from '../server/kitchen/validation';
// Versioned wire format. No household IDs, pantry mappings or private notes.
export const snapshotValidator=v.object({
  version:v.literal(1), title:v.string(), description:v.optional(v.string()), tags:v.array(v.string()),
  servings:v.optional(v.number()), totalTimeMinutes:v.optional(v.number()),
  sourceUrl:v.optional(v.string()), photoDataUrl:v.optional(v.string()),
  ingredients:v.array(v.object({name:v.string(),quantity:v.optional(v.number()),unit:v.optional(v.string()),note:v.optional(v.string())})),
  steps:v.array(v.object({text:v.string()})),
});
export type RecipeSnapshot=Infer<typeof snapshotValidator>;
const inRange=(value:number|undefined,min:number,max:number)=>typeof value==='number' && Number.isFinite(value) && value>=min && value<=max?value:undefined;
/**
 * A copy whose numbers are safe to show and convert: servings and time that
 * aren't sensible positive amounts, and quantities that aren't finite and
 * non-negative, are left out. Older apps convert these to integers unchecked.
 */
export function saneNumbers(snapshot:RecipeSnapshot):RecipeSnapshot {
  const {servings,totalTimeMinutes,...rest}=snapshot;const result:RecipeSnapshot={...rest,ingredients:snapshot.ingredients.map(({quantity,...ingredient})=>{const amount=inRange(quantity,0,1e9);return amount===undefined?ingredient:{...ingredient,quantity:amount};})};
  const people=inRange(servings,0.01,100000),minutes=inRange(totalTimeMinutes,0.01,1000000);
  if(people!==undefined)result.servings=people;if(minutes!==undefined)result.totalTimeMinutes=minutes;
  return result;
}
/** Checks a snapshot's shape and limits and returns it with `saneNumbers` applied. */
export function parseSnapshot(value:unknown):RecipeSnapshot {
  validate(descriptor(snapshotValidator),value);const snapshot=saneNumbers(value as RecipeSnapshot);
  if(!snapshot.title.trim() || snapshot.title.length>200 || snapshot.ingredients.length>200 || snapshot.steps.length>200 || snapshot.tags.length>30 || JSON.stringify(snapshot).length>750000)throw new Error('Recipe exceeds community limits');
  if(snapshot.photoDataUrl && !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(snapshot.photoDataUrl))throw new Error('Invalid recipe photo');
  if(snapshot.sourceUrl && !/^https?:\/\//.test(snapshot.sourceUrl))throw new Error('Invalid source URL');
  return snapshot;
}
export type Publication={id:string;revision:number;author:{id:string;name:string};createdAt:string;snapshot:RecipeSnapshot};
export function communityRecipe(publication:Publication) {
  const s=parseSnapshot(publication.snapshot);
  return {id:publication.id,...s,photoUrl:s.photoDataUrl,ingredients:s.ingredients.map((i,n)=>({...i,id:String(n)})),steps:s.steps.map((step,n)=>({...step,id:String(n)})),author:publication.author,createdAt:publication.createdAt,likes:0,savedCount:0};
}

// ── API v2 (docs/COMMUNITY_API.md) ──────────────────────────────────────
export type Author={id:string;name:string};
/** A recipe in a list: no steps, quantities or inline photo. */
export type Listing={
  id:string;revision:number;createdAt:string;updatedAt:string;author:Author;
  title:string;description?:string;tags:string[];servings?:number;totalTimeMinutes?:number;
  photoUrl?:string;ingredientNames:string[];
  likeCount:number;saveCount:number;madeCount:number;rating?:number;shareUrl?:string;liked?:boolean;
};
export type Tip={id:string;author:Author;rating:number;tip?:string;createdAt:string};
export type Detail=Listing&{
  visibility:'public'|'unlisted';snapshot:RecipeSnapshot;tips:Tip[];
  viewer?:{liked:boolean;following:boolean;own:boolean;made?:{rating:number;tip?:string}};
};
export type Cook={id:string;name:string;bio?:string;recipeCount:number;followerCount:number;followingCount:number;viewer?:{following:boolean;own:boolean}};
export type Me=Cook&{moderator:boolean};
export type OwnListing=Listing&{visibility:'public'|'unlisted'|'private';removed:boolean;underReview:boolean};
export const REPORT_REASONS=['offensive','harassment','sexual','spam','dangerous','copyright','other'] as const;
export type ReportReason=typeof REPORT_REASONS[number];
export const REPORT_REASON_LABELS:Record<ReportReason,string>={offensive:'Offensive or hateful',harassment:'Harassment',sexual:'Sexual content',spam:'Spam or scam',dangerous:'Dangerous or unsafe food advice',copyright:'Copyright',other:'Other'};
export type ReportStatus='open'|'actioned'|'dismissed';
export type ModAction='dismiss'|'remove_recipe'|'remove_tip'|'ban_user';
export type Report={
  id:string;status:ReportStatus;createdAt:string;reason:ReportReason;note?:string;reportCount:number;
  recipe:{id:string;title:string;author:Author;visibility:string;underReview:boolean}|null;
  tip?:{id:string;author:Author;rating:number;tip?:string};resolution?:string;resolvedAt?:string;
};
export type SortOrder='new'|'hot'|'top';
export type PantryMatch={have:number;total:number;missing:string[]};
export type LocalListing=Listing&{saved:boolean;pantry?:PantryMatch};
export type LocalDetail=Detail&{saved:boolean;savedRecipeId?:string;pantry?:PantryMatch};
export const COMMUNITY_LIMITS={name:40,bio:160,tip:280,reportNote:500,follows:200,autoHideReports:3} as const;
