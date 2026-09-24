import type { ActionCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { hashCommunityToken } from './hub';

export const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});

export class BodyTooLarge extends Error {}

/** Reads at most `limit` bytes, including chunked requests, then parses JSON. */
export async function readBoundedJson(request:Request,limit:number):Promise<unknown> {
  const reader=request.body?.getReader();let size=0;let text='';const decoder=new TextDecoder();
  if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new BodyTooLarge();}text+=decoder.decode(part.value,{stream:true});}
  text+=decoder.decode();return JSON.parse(text||'{}');
}

/** Resolves a `Bearer` publisher token to its user, or null. */
export async function bearerUser(ctx:ActionCtx,request:Request):Promise<Id<'users'>|null> {
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!token || token.length>512)return null;
  return ctx.runQuery(internal.hub.identify,{hash:await hashCommunityToken(token)});
}

export function clientAddress(request:Request) {
  return request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||request.headers.get('x-real-ip')||'unknown';
}
