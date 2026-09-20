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
export function parseSnapshot(value:unknown):RecipeSnapshot {
  validate(descriptor(snapshotValidator),value);const snapshot=value as RecipeSnapshot;
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
