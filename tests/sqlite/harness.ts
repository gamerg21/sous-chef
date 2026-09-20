import { KitchenDatabase } from '../../src/server/kitchen/database';
import { execute, context } from '../../src/server/kitchen/execute';
import type { Ref, MutationCtx } from '../../src/server/kitchen/_generated/server';
import type { Id } from '../../src/server/kitchen/_generated/dataModel';
import { afterEach } from 'vitest';
const databases:KitchenDatabase[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});
export function kitchenTest(database=new KitchenDatabase(':memory:'),userId:Id<'users'>|null=null) {
  if(!databases.includes(database))databases.push(database);
  const invoke=<A,R>(ref:Ref<A,R>,args:A)=>execute<R>(ref.path,args,userId,true,database);
  return {query:invoke,mutation:invoke,action:invoke,run:<R>(fn:(ctx:MutationCtx)=>Promise<R>)=>database.transaction(db=>fn(context(database,userId,db))),withIdentity:(identity:{subject:string})=>kitchenTest(database,identity.subject.split('|')[0] as Id<'users'>)};
}
