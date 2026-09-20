import { expect,test,afterEach,vi } from 'vitest';
import { KitchenDatabase } from '../../src/server/kitchen/database';
import { authenticate,session,checkPassword,digest } from '../../src/server/kitchen/authentication';
import { execute } from '../../src/server/kitchen/execute';
import { scryptSync } from 'node:crypto';
import { cleanupExpiredDemos } from '../../scripts/demo-cleanup-lib.mjs';
const databases:KitchenDatabase[]=[];const make=()=>{const db=new KitchenDatabase(':memory:');databases.push(db);return db;};
afterEach(()=>{databases.splice(0).forEach(db=>db.close());vi.unstubAllEnvs();});
test('local login is hashed, sessions expire, and internal endpoints cannot be called over public API',async()=>{
 const db=make();const result=await authenticate({flow:'signUp',email:'user@example.com',password:'Password123!',name:'Cook'},db);
 const user=await session(result.token,db);expect(user?.email).toBe('user@example.com');
 expect(db.sql.prepare('SELECT hash FROM credentials').get()?.hash).not.toContain('Password123');
 await expect(authenticate({flow:'signIn',email:'user@example.com',password:'wrong'},db)).rejects.toThrow('Invalid');
 expect(db.sql.prepare('SELECT COUNT(*) n FROM login_limits').get()?.n).toBe(2);
 await expect(execute('units:seed',{},user!._id,false,db)).rejects.toThrow('Unknown operation');
 db.sql.prepare('UPDATE sessions SET expires=0 WHERE token_hash=?').run(digest(result.token!));expect(await session(result.token,db)).toBeNull();
});
test('migrated Lucia passwords retain compatibility including Unicode normalization',()=>{
 const password='Ｐassword123!';const salt='f'.repeat(32);const hash=scryptSync(password.normalize('NFKC'),salt,64,{N:16384,r:16,p:1,maxmem:64*1024*1024}).toString('hex');
 expect(checkPassword(password,`lucia-scrypt:${salt}:${hash}`)).toBe(true);expect(checkPassword('wrong',`lucia-scrypt:${salt}:${hash}`)).toBe(false);
});
test('failed transactions roll back all writes and concurrent transactions do not interleave',async()=>{
 const db=make();await expect(db.transaction(async tx=>{await tx.insert('households',{name:'rollback'});throw new Error('stop');})).rejects.toThrow('stop');
 expect(await db.transaction(tx=>tx.query('households').collect())).toHaveLength(0);
 await Promise.all(Array.from({length:8},(_,i)=>db.transaction(async tx=>{const existing=await tx.query('households').collect();await Promise.resolve();await tx.insert('households',{name:`${i}:${existing.length}`});})));
 const households=await db.transaction(tx=>tx.query('households').collect());expect(new Set(households.map(h=>h.name.split(':')[1])).size).toBe(8);
});
test('demo kitchens are isolated and expired demos are removed without touching active users',async()=>{
 vi.stubEnv('SOUS_CHEF_DEMO','true');const db=make();const a=await authenticate({flow:'demo'},db);const b=await authenticate({flow:'demo'},db);const alice=await session(a.token,db);const bob=await session(b.token,db);
 const kitchens=await execute<{id:string}[]>('households:list',{},alice!._id,false,db);expect(kitchens).toHaveLength(1);
 await expect(execute('inventory:list',{householdId:kitchens[0].id},bob!._id,false,db)).rejects.toThrow('Permission denied');
 await db.transaction(async tx=>{await tx.patch(alice!._id,{demoExpiresAt:1});cleanupExpiredDemos(db.sql);});
 expect(await session(a.token,db)).toBeNull();expect(await session(b.token,db)).not.toBeNull();
 expect(await db.transaction(tx=>tx.query('households').collect())).toHaveLength(1);
});
test('a forged local photo URL cannot expose another household file through export',async()=>{
 const db=make();const a=await authenticate({flow:'signUp',email:'alice@example.com',password:'Password123!'},db);const b=await authenticate({flow:'signUp',email:'bob@example.com',password:'Password123!'},db);const alice=await session(a.token,db);const bob=await session(b.token,db);
 db.sql.prepare('INSERT INTO files VALUES(?,?,?,?)').run('private-file',alice!._id,'image/png',Buffer.from('private'));
 await execute('recipes:create',{title:'Forged photo',photoUrl:'/api/files/private-file',ingredients:[],steps:[]},bob!._id,false,db);
 const result=await execute<{recipes:{photoDataUrl?:string}[]}>('recipes:exportAll',{},bob!._id,false,db);expect(result.recipes[0].photoDataUrl).toBeUndefined();
});
test('editing local visibility preserves community publication state and unpublishing needs no photo',async()=>{
 vi.stubEnv('COMMUNITY_API_URL','https://example.convex.site');const db=make();const login=await authenticate({flow:'signUp',email:'publisher@example.com',password:'Password123!'},db);const user=(await session(login.token,db))!;
 const recipeId=await db.transaction(async tx=>{const householdId=await tx.insert('households',{name:'Kitchen'});await tx.insert('householdMembers',{householdId,userId:user._id,role:'owner'});await tx.insert('communityConnections',{userId:user._id,token:'test'});return tx.insert('recipes',{householdId,title:'Recipe',favorited:false,visibility:'private',photoUrl:'/api/files/large'});});
 db.sql.prepare('INSERT INTO files VALUES(?,?,?,?)').run('large',user._id,'image/png',Buffer.alloc(500001));
 await execute('community:recordPublication',{recipeId,remoteId:'remote',revision:1,visibility:'public'},user._id,true,db);
 await db.transaction(tx=>tx.patch(recipeId,{visibility:'household'}));
 const recipe=await execute<{visibility:string;publicationVisibility:string}>('recipes:getById',{id:recipeId},user._id,false,db);expect(recipe.visibility).toBe('household');expect(recipe.publicationVisibility).toBe('public');
 await expect(execute('community:preparePublication',{recipeId},user._id,true,db)).rejects.toThrow('500 KB');
 await expect(execute('community:preparePublication',{recipeId,includePhoto:false},user._id,true,db)).resolves.toMatchObject({remoteId:'remote'});
 await execute('community:markUnpublished',{recipeId},user._id,true,db);
 expect(await execute('recipes:getById',{id:recipeId},user._id,false,db)).toMatchObject({visibility:'household',publicationVisibility:'private'});
});
