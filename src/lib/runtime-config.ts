/** Browser-safe runtime configuration; local kitchens never require Convex. */
export function getPublicRuntimeConfig(env:Record<string,string|undefined>) {
  let communityConvexUrl:string|null=null;
  try {const url=new URL(env.COMMUNITY_CONVEX_URL||'');if(url.protocol==='https:' && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash)communityConvexUrl=url.origin;}catch{}
  return {backend:'sqlite' as const,communityEnabled:!!env.COMMUNITY_API_URL,communityConvexUrl,demo:env.SOUS_CHEF_DEMO==='true'};
}
