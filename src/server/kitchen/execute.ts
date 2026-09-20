import { readAuthorizedFile } from './files';
import { randomUUID } from 'node:crypto';
import { v } from 'convex/values';
import { modules } from './registry';
import { getDatabase, type KitchenDatabase } from './database';
import { validate, descriptor } from './validation';
import type { Endpoint, MutationCtx, Ref } from './_generated/server';
import type { Id } from './_generated/dataModel';
function resolve(path:string):Endpoint {
  const [module,name,...rest]=path.split(':');
  if(rest.length || !Object.hasOwn(modules,module)) throw new Error('Unknown operation');
  const entries=modules[module as keyof typeof modules];
  if(!Object.hasOwn(entries,name)) throw new Error('Unknown operation');
  const endpoint=(entries as unknown as Record<string,Endpoint>)[name];
  if(!endpoint || typeof endpoint.handler!=='function') throw new Error('Unknown operation');
  return endpoint;
}
export function context(database:KitchenDatabase,userId:Id<'users'>|null,db?:MutationCtx['db']):MutationCtx {
  const invoke = async <A,R>(ref:Ref<A,R>,args:A):Promise<R> => {
    const endpoint=resolve(ref.path);
    if(db) {if(endpoint.kind==='action')throw new Error('Network action inside transaction');validate(descriptor(v.object(endpoint.args)),args);return endpoint.handler(context(database,userId,db),args);}
    return execute(ref.path,args,userId,true,database);
  };
  return {db:db ?? new Proxy({} as MutationCtx['db'],{get(){throw new Error('Actions must use a transaction');}}),userId,
    auth:{getUserIdentity:async()=>userId?{subject:userId,tokenIdentifier:userId}:null},
    files:{read:(id)=>readAuthorizedFile(database.sql,id,userId),store:(mime,bytes)=>{if(!db || !userId)throw new Error('File storage requires authenticated transaction');const id=randomUUID();database.sql.prepare('INSERT INTO files VALUES(?,?,?,?)').run(id,userId,mime,bytes);return id;}},
    storage:{generateUploadUrl:async()=>'/api/files',getUrl:async(id)=>{
      const row=database.sql.prepare('SELECT user_id FROM files WHERE id=?').get(id);
      if(!row || row.user_id!==userId)throw new Error('Permission denied');return `/api/files/${id}`;
    }},runQuery:invoke,runMutation:invoke,runAction:invoke};
}
export async function execute<R=unknown>(path:string,args:unknown,userId:Id<'users'>|null,internal=false,database=getDatabase()):Promise<R> {
  const endpoint=resolve(path);
  if(!internal && endpoint.visibility!=='public')throw new Error('Unknown operation');
  if(!internal && !userId)throw new Error('Not authenticated');
  validate(descriptor(v.object(endpoint.args)),args);
  if(endpoint.kind==='action')return endpoint.handler(context(database,userId),args) as Promise<R>;
  return database.transaction(async db=>endpoint.handler(context(database,userId,db),args),endpoint.kind==='mutation');
}
export async function initialize(database=getDatabase()) {
  await database.transaction(async db=>{
    if(!database.sql.prepare("SELECT 1 FROM metadata WHERE key='units_seeded'").get()) {
      await modules.units.seed.handler(context(database,null,db),{});
      database.sql.prepare("INSERT INTO metadata VALUES('units_seeded','1')").run();
    }
  });
}
