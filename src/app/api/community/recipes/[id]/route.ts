import { publicDownload } from '@/server/kitchen/communityPublic';
export const runtime='nodejs';
/** A community recipe as a portable file for the recipe library's Import command, photo embedded. */
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;const recipe=await publicDownload(id);
 if(!recipe)return Response.json({error:'Recipe unavailable'},{status:404,headers:{'Cache-Control':'no-store'}});
 return Response.json([{...recipe.snapshot,communityOrigin:{id:recipe.id,revision:recipe.revision,author:recipe.author,origin:process.env.COMMUNITY_API_URL}}],{headers:{'Content-Disposition':'attachment; filename="sous-chef-recipe.json"','Cache-Control':'no-store'}});
}
