/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect,test } from 'vitest';
import schema from './schema';
import { api,internal } from './_generated/api';
const modules=import.meta.glob('./**/*.ts');
const snapshot={version:1 as const,title:'Tomato pasta',tags:['quick'],ingredients:[{name:'Pasta',quantity:200,unit:'g'}],steps:[{text:'Cook.'}]};
test('community publications are independent, ownership checked, and unlisted stays out of search',async()=>{
 const t=convexTest(schema,modules);
 const [alice,bob]=await t.run(async ctx=>Promise.all([ctx.db.insert('users',{name:'Alice'}),ctx.db.insert('users',{name:'Bob'})]));
 const publication=await t.mutation(internal.hub.publish,{userId:alice,snapshot,visibility:'unlisted'});
 expect((await t.query(api.hub.list,{})).recipes).toHaveLength(0);
 expect((await t.query(api.hub.get,{id:publication.id}))?.snapshot).toEqual(snapshot);
 await expect(t.mutation(internal.hub.publish,{userId:bob,id:publication.id,snapshot,visibility:'public'})).rejects.toThrow('Permission denied');
 await t.mutation(internal.hub.publish,{userId:alice,id:publication.id,snapshot,visibility:'public'});
 expect((await t.query(api.hub.list,{})).recipes[0].revision).toBe(2);
 await expect(t.mutation(internal.hub.unpublish,{userId:bob,id:publication.id})).rejects.toThrow('Permission denied');
 await t.mutation(internal.hub.unpublish,{userId:alice,id:publication.id});
 expect(await t.query(api.hub.get,{id:publication.id})).toBeNull();
});
test('revoking publishing connections invalidates bearer token identities',async()=>{
 const t=convexTest(schema,modules);const id=await t.run(ctx=>ctx.db.insert('users',{name:'Alice'}));const user=t.withIdentity({subject:`${id}|session`});
 await user.mutation(internal.hub.storeToken,{hash:'test-hash'});
 expect(await t.query(internal.hub.identify,{hash:'test-hash'})).toBe(id);
 await user.mutation(api.hub.revokeTokens,{});
 expect(await t.query(internal.hub.identify,{hash:'test-hash'})).toBeNull();
});
