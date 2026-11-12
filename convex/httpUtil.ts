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

/** Decodes a `data:image/…;base64,` URL, or returns null when it isn't one. */
export function decodeDataUrl(dataUrl:string):{type:string;bytes:Uint8Array<ArrayBuffer>}|null {
  const match=/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if(!match)return null;
  try{
    const binary=atob(match[2]);const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return {type:match[1],bytes};
  }catch{return null;}
}

export async function toDataUrl(blob:Blob,type:string):Promise<string> {
  const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return `data:${type};base64,${btoa(binary)}`;
}

/** Length of the data URL `toDataUrl` makes for a file of `size` bytes. */
export const dataUrlLength=(size:number,type:string)=>`data:${type};base64,`.length+Math.ceil(size/3)*4;
