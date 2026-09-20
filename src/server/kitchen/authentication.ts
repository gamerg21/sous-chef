import { cleanupExpiredDemos } from '../../../scripts/demo-cleanup-lib.mjs';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { getDatabase, type KitchenDatabase } from './database';
import type { Id } from './_generated/dataModel';
import { createDefaultHousehold } from './helpers';
import { context } from './execute';
import { isValidEmail, normalizeEmail } from '../../lib/auth-utils';
export const COOKIE='sous_chef_session';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function hashPassword(password:string):string {
  if(password.length<8 || password.length>128)throw new Error('Password must be 8–128 characters');
  const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
}
export function checkPassword(password:string,hash:string):boolean {
  const [kind,salt,expected]=hash.split(':');if(!['scrypt','lucia-scrypt'].includes(kind) || !salt || !expected || password.length>128)return false;
  const actual=kind==='lucia-scrypt'?scryptSync(password.normalize('NFKC'),salt,64,{N:16384,r:16,p:1,maxmem:64*1024*1024}):scryptSync(password,salt,64);const wanted=Buffer.from(expected,'hex');return wanted.length===actual.length && timingSafeEqual(wanted,actual);
}
export async function session(token:string|undefined,database=getDatabase()) {
  if(!token)return null;
  return database.transaction(async db=>{const row=database.sql.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires>?').get(digest(token),Date.now());
    if(!row)return null;const user=await db.get(row.user_id as Id<'users'>);if(!user || (user.demoExpiresAt && user.demoExpiresAt<Date.now()))return null;return user;},false);
}
export function limit(database:KitchenDatabase,subject:string,max=10) {
  const now=Date.now(); database.sql.prepare('DELETE FROM login_limits WHERE expires<?').run(now);
  const row=database.sql.prepare('SELECT count FROM login_limits WHERE subject=?').get(subject);
  if(row && Number(row.count)>=max)throw new Error('Too many attempts. Try again later.');
  database.sql.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(subject) DO UPDATE SET count=count+1').run(subject,now+15*60*1000);
}
export async function authenticate(body:Record<string,unknown>,database=getDatabase()):Promise<{token?:string;signingIn:boolean}> {
  const flow=String(body.flow||'');const email=normalizeEmail(String(body.email||''));const password=String(body.password||'');
  if(!['signUp','signIn','demo','reset-verification'].includes(flow))throw new Error('Invalid authentication request');
  if(flow==='demo' && process.env.SOUS_CHEF_DEMO!=='true')throw new Error('Demo is disabled');
  if(flow!=='demo' && !isValidEmail(email))throw new Error('Invalid email or password');
  // Commit rate limits independently so failed login transactions cannot undo them.
  await database.transaction(async()=>{limit(database,'auth:instance',300);limit(database,`auth:${digest(email||'demo')}`,flow==='demo'?100:20);});
  const passwordHash=flow==='signUp'?hashPassword(password):flow==='reset-verification'?hashPassword(String(body.newPassword||'')):undefined;
  return database.transaction(async db=>{
    const user=flow==='demo'?null:await db.query('users').withIndex('email',q=>q.eq('email',email)).first();
    let userId:Id<'users'>;
    if(flow==='signUp' || flow==='demo') {
      if(flow==='demo'){cleanupExpiredDemos(database.sql);if((await db.query('users').take(1000)).length>=1000)throw new Error('Demo is busy. Please try again later.');}
      if(process.env.SOUS_CHEF_DEMO==='true' && flow==='signUp')throw new Error('Use the demo kitchen. Community accounts are separate.');
      if(flow==='signUp' && process.env.SOUS_CHEF_ALLOW_SIGNUP==='false' && await db.query('users').first())throw new Error('Registration is closed');
      if(user)throw new Error('Unable to create account with those details');
      userId=await db.insert('users',{email:flow==='demo'?undefined:email,name:flow==='demo'?'Demo cook':String(body.name||'').slice(0,100),demoExpiresAt:flow==='demo'?Date.now()+86400000:undefined});
      if(passwordHash)database.sql.prepare('INSERT INTO credentials VALUES(?,?)').run(userId,passwordHash);
      if(flow!=='demo' && (await db.query('users').take(2)).length===1)await db.insert('appAdmins',{userId});
      const householdId=await createDefaultHousehold(context(database,userId,db),userId);
      if(flow==='demo') {
        const location=await db.query('kitchenLocations').withIndex('by_householdId',q=>q.eq('householdId',householdId)).filter(q=>q.eq(q.field('name'),'Pantry')).first();
        for(const [name,quantity,unit] of [['Pasta',500,'g'],['Tomatoes',4,'each'],['Olive oil',250,'ml']] as const) {
          const foodItemId=await db.insert('foodItems',{name});await db.insert('inventoryItems',{householdId,foodItemId,locationId:location!._id,quantity,unit});
        }
        const recipeId=await db.insert('recipes',{householdId,title:'Weeknight tomato pasta',description:'A simple recipe to explore your demo kitchen.',servings:2,totalTimeMinutes:20,visibility:'private',favorited:false});
        for(const [order,name,quantity,unit] of [[0,'Pasta',200,'g'],[1,'Tomatoes',2,'each'],[2,'Olive oil',15,'ml']] as const)await db.insert('recipeIngredients',{recipeId,order,name,quantity,unit});
        await db.insert('recipeSteps',{recipeId,order:0,text:'Cook the pasta. Simmer chopped tomatoes in olive oil, then combine and serve.'});
      }
    } else {
      if(!user) {scryptSync(password.slice(0,128),'dummy-salt',64);throw new Error('Invalid email or password');}
      userId=user._id;
      if(flow==='reset-verification') {
        const row=database.sql.prepare('SELECT * FROM reset_tokens WHERE token_hash=? AND user_id=? AND expires>?').get(digest(String(body.code||'')),userId,Date.now());
        if(!row)throw new Error('Invalid or expired reset link');
        database.sql.prepare('INSERT INTO credentials VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash').run(userId,passwordHash!);
        database.sql.prepare('DELETE FROM reset_tokens WHERE user_id=?').run(userId);database.sql.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
      } else {
        const credentials=database.sql.prepare('SELECT hash FROM credentials WHERE user_id=?').get(userId);
        if(!credentials || !checkPassword(password,String(credentials.hash)))throw new Error('Invalid email or password');
        if(String(credentials.hash).startsWith('lucia-scrypt:'))database.sql.prepare('UPDATE credentials SET hash=? WHERE user_id=?').run(hashPassword(password),userId);
      }
    }
    const token=randomBytes(32).toString('base64url');
    database.sql.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    database.sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),userId,Date.now()+(flow==='demo'?86400000:30*86400000));
    return {token,signingIn:true};
  });
}
