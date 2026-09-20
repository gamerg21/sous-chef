/** Offline migration only. Never connects to, alters or deletes a Convex deployment. */
import { readFileSync, mkdirSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { KitchenDatabase } from '../src/server/kitchen/database';
import schema from '../src/server/kitchen/schema';
import { validate } from '../src/server/kitchen/validation';
import { randomBytes } from 'node:crypto';
async function main() {
 const archive=process.argv[2];const destination=process.argv[3];if(!archive||!destination)throw new Error('Usage: pnpm migrate:sqlite snapshot.zip NEW-data-directory');
 const directory=resolve(destination);if(existsSync(directory))throw new Error('Destination must not exist; migration never overwrites a kitchen');
 const zip=unzipSync(readFileSync(archive));
 const tables=JSON.parse((schema as unknown as {export():string}).export()).tables;
 const records=new Map<string,Record<string,unknown>[]>();const ids=new Map<string,string>();
 for(const table of tables){const bytes=zip[`${table.tableName}/documents.jsonl`];const rows=bytes?strFromU8(bytes).split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];records.set(table.tableName,rows);for(const row of rows)ids.set(String(row._id),`${table.tableName}_${row._id}`);}
 const convert=(value:unknown):unknown=>typeof value==='string'?ids.get(value)||value:Array.isArray(value)?value.map(convert):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,convert(v)])):value;
 const existingKey=process.env.SECRETS_ENCRYPTION_KEY;
 if(!existingKey && [...records.values()].some(rows=>JSON.stringify(rows).includes('enc:v1:')))throw new Error('Set the old SECRETS_ENCRYPTION_KEY before importing encrypted credentials');
 mkdirSync(directory,{recursive:true,mode:0o700});const database=new KitchenDatabase(join(directory,'kitchen.sqlite'));
 try{await database.transaction(async()=>{
   for(const table of tables){for(const row of records.get(table.tableName)||[]){const fields=Object.fromEntries(Object.entries(row).filter(([key])=>Object.hasOwn(table.documentType.value,key)));const data=convert(fields);validate(table.documentType,data);
    database.sql.prepare(`INSERT INTO "${table.tableName}" VALUES(?,?,?)`).run(ids.get(String(row._id))!,Number(row._creationTime),JSON.stringify(data));
   }}
   const accounts=zip['authAccounts/documents.jsonl'];
   if(accounts)for(const line of strFromU8(accounts).split('\n').filter(Boolean)){const account=JSON.parse(line);const userId=ids.get(account.userId);if(userId && account.provider==='password' && typeof account.secret==='string' && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(account.secret))database.sql.prepare('INSERT OR IGNORE INTO credentials VALUES(?,?)').run(userId,`lucia-scrypt:${account.secret}`);}
   const storage=zip['_storage/documents.jsonl'];let migratedFiles=0;
   if(storage)for(const line of strFromU8(storage).split('\n').filter(Boolean)){
    const metadata=JSON.parse(line);const entry=Object.keys(zip).find(name=>name.startsWith('_storage/') && name.split('/').pop()?.split('.')[0]===metadata._id);if(!entry)throw new Error('Snapshot is missing a stored file; re-export with --include-file-storage');
    for(const tableName of ['recipes','inventoryItems'])for(const row of records.get(tableName)||[]){if(typeof row.photoUrl!=='string' || !row.photoUrl.includes(metadata._id))continue;
      const member=(records.get('householdMembers')||[]).find(m=>m.householdId===row.householdId);if(!member)throw new Error('Photo owner could not be resolved');
      const id=`${metadata._id}-${migratedFiles++}`;database.sql.prepare('INSERT INTO files VALUES(?,?,?,?)').run(id,ids.get(String(member.userId))!,metadata.contentType||'application/octet-stream',zip[entry]);
      database.sql.prepare(`UPDATE "${tableName}" SET data=json_set(data,'$.photoUrl',?) WHERE id=?`).run(`/api/files/${id}`,ids.get(String(row._id))!);
      database.sql.prepare("UPDATE mediaAssets SET data=json_set(data,'$.url',?) WHERE json_extract(data,'$.url')=?").run(`/api/files/${id}`,row.photoUrl);
    }
   }
   database.sql.prepare("INSERT INTO metadata VALUES('imported_from_convex',?)").run(new Date().toISOString());
  });
  writeFileSync(join(directory,'secrets.key'),existingKey||randomBytes(32).toString('hex'),{mode:0o600});chmodSync(join(directory,'kitchen.sqlite'),0o600);
  const counts=Object.fromEntries([...records].map(([table,rows])=>[table,rows.length]));writeFileSync(join(directory,'migration-report.json'),JSON.stringify({counts,accounts:'Compatible Convex Auth password hashes migrated; sessions are not imported. Unsupported accounts need operator recovery.'},null,2),{mode:0o600});
  console.log(JSON.stringify({destination:directory,counts},null,2));console.log('Compatible password accounts retain their passwords. Unsupported credentials require operator recovery. Community accounts remain unchanged.');
 }finally{database.close();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1;});
