import { existsSync, mkdirSync, accessSync, constants } from 'node:fs';
import { resolve } from 'node:path';
for(const file of ['.env.local','.env'])if(existsSync(file))process.loadEnvFile(file);
let failures=0;const report=(ok,message)=>{console.log(`${ok?'OK':'FIX'}  ${message}`);if(!ok)failures++;};
const [major,minor]=process.versions.node.split('.').map(Number);report(major>22 || major===22&&minor>=18,'Node.js 22.18+ (built-in SQLite)');
const directory=resolve(process.env.SOUS_CHEF_DATA_DIR||'./data');try{mkdirSync(directory,{recursive:true,mode:0o700});accessSync(directory,constants.W_OK);report(true,`Writable kitchen directory: ${directory}`);}catch{report(false,'Data directory must be writable by the app user');}
report(true,'Local kitchens do not require a Convex deployment or account');
if(process.env.COMMUNITY_API_URL)try{const url=new URL(process.env.COMMUNITY_API_URL);report(url.protocol==='https:','Community API uses HTTPS');const r=await fetch(`${url.origin}/api/v1/recipes?limit=1`,{signal:AbortSignal.timeout(8000)});report(r.ok,'Community browse endpoint reachable');}catch{report(false,'Community endpoint unreachable (local kitchens still work)');}
console.log('Run pnpm dev, create a local account, and verify cooking and backup restoration. This check does not verify login or email delivery.');process.exitCode=failures?1:0;
