#!/usr/bin/env node
import { DatabaseSync, backup } from 'node:sqlite';
import { resolve, join } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
for(const file of ['.env.local','.env'])if(existsSync(file))process.loadEnvFile(file);
const command=process.argv[2];const directory=resolve(process.env.SOUS_CHEF_DATA_DIR||'./data');const filename=join(directory,'kitchen.sqlite');
if(!existsSync(filename))throw new Error('No kitchen database found. Start the app first, or set SOUS_CHEF_DATA_DIR.');
const sql=new DatabaseSync(filename);sql.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
try {
 if(command==='backup') {
  const destination=resolve(process.argv[3]||join('backups',new Date().toISOString().replace(/[:.]/g,'-')));
  mkdirSync(destination,{recursive:true,mode:0o700});const target=join(destination,'kitchen.sqlite');if(existsSync(target))throw new Error('Backup already exists');
  await backup(sql,target);chmodSync(target,0o600);
  const key=process.env.SECRETS_ENCRYPTION_KEY || (existsSync(join(directory,'secrets.key'))?readFileSync(join(directory,'secrets.key'),'utf8'):null);
  if(key)writeFileSync(join(destination,'secrets.key'),key,{mode:0o600,flag:'wx'});
  writeFileSync(join(destination,'manifest.json'),JSON.stringify({format:1,createdAt:new Date().toISOString(),includes:['database','photos','credentials','sessions','community connections','encryption key when configured']},null,2),{mode:0o600});
  console.log(`Backup saved to ${destination}. Keep it private; it contains credentials and personal data.`);
 }else if(command==='reset-password') {
  const email=(process.argv[3]||'').trim().toLowerCase();if(!email)throw new Error('Usage: reset-password email (new password on stdin)');
  let password='';for await(const chunk of process.stdin){password+=chunk;if(password.length>256)throw new Error('Password too long');}password=password.replace(/[\r\n]+$/,'');if(password.length<8 || password.length>128)throw new Error('Password must be 8–128 characters');
  const user=sql.prepare("SELECT id FROM users WHERE json_extract(data,'$.email')=?").get(email);if(!user)throw new Error('Account not found');
  const salt=randomBytes(16).toString('hex');const hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
  sql.exec('BEGIN IMMEDIATE');try{sql.prepare('INSERT INTO credentials VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash').run(user.id,hash);sql.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);sql.prepare('DELETE FROM reset_tokens WHERE user_id=?').run(user.id);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}console.log('Password updated; existing local sessions revoked.');
 }else if(command==='restore-copy') {
  const destination=process.argv[3];if(!destination)throw new Error('Supply a NEW data directory');const target=resolve(destination);if(existsSync(target))throw new Error('Restore destination must not exist');mkdirSync(target,{recursive:true,mode:0o700});await backup(sql,join(target,'kitchen.sqlite'));chmodSync(join(target,'kitchen.sqlite'),0o600);if(existsSync(join(directory,'secrets.key')))copyFileSync(join(directory,'secrets.key'),join(target,'secrets.key'));console.log(`Restored copy to ${target}. Start a separate app with SOUS_CHEF_DATA_DIR pointing there.`);
 }else throw new Error('Commands: backup [destination], reset-password email, restore-copy new-directory');
}finally{sql.close();}
