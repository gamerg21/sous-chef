import { expect, test } from 'vitest';
import { getPublicRuntimeConfig } from '../src/lib/runtime-config';
test('local kitchen requires no backend URL and leaks no keys',()=>{
 expect(getPublicRuntimeConfig({SECRETS_ENCRYPTION_KEY:'secret',CONVEX_DEPLOY_KEY:'secret',CONVEX_URL:'https://old.convex.cloud'})).toEqual({backend:'sqlite',communityEnabled:false,communityConvexUrl:null,demo:false});
});
test.each(['javascript:alert(1)','https://user:secret@host.test','https://host.test/?secret=yes','https://host.test/api','invalid'])('rejects unsafe public community config %s',url=>{expect(getPublicRuntimeConfig({COMMUNITY_CONVEX_URL:url}).communityConvexUrl).toBeNull();});
test('community settings are opt-in runtime values',()=>{expect(getPublicRuntimeConfig({COMMUNITY_API_URL:'https://community.convex.site',COMMUNITY_CONVEX_URL:'https://community.convex.cloud',SOUS_CHEF_DEMO:'true'})).toEqual({backend:'sqlite',communityEnabled:true,communityConvexUrl:'https://community.convex.cloud',demo:true});});
