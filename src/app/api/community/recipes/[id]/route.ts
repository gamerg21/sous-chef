import { remote } from '@/server/kitchen/community';
import { parseSnapshot, type Publication } from '@/lib/community-contract';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 try{const {id}=await params;const publication=await remote<Publication>(`recipes/${encodeURIComponent(id)}`);const snapshot=parseSnapshot(publication.snapshot);
 return Response.json([{...snapshot,communityOrigin:{id:publication.id,revision:publication.revision,author:publication.author.name,origin:process.env.COMMUNITY_API_URL}}],{headers:{'Content-Disposition':'attachment; filename="sous-chef-recipe.json"','Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Recipe unavailable'},{status:404});}
}
