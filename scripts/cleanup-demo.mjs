import { DatabaseSync } from 'node:sqlite';
import { resolve,join } from 'node:path';
import { existsSync } from 'node:fs';
import { cleanupExpiredDemos } from './demo-cleanup-lib.mjs';
for(const file of ['.env.local','.env'])if(existsSync(file))process.loadEnvFile(file);
const filename=join(resolve(process.env.SOUS_CHEF_DATA_DIR||'./data'),'kitchen.sqlite');if(!existsSync(filename))throw new Error('Kitchen database not found');
const sql=new DatabaseSync(filename);sql.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
let total=0;try{let count;do{sql.exec('BEGIN IMMEDIATE');try{count=cleanupExpiredDemos(sql);total+=count;sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}while(count===100);console.log(`Removed ${total} expired demo identities and their private kitchens.`);}finally{sql.close();}
