export function checkOrigin(request:Request) {
  const origin=request.headers.get('origin');
  const expected=process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
  if(origin && origin!==expected)throw new Error('Request origin rejected');
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new Error('Request origin rejected');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('JSON request required');
}
export async function readJson(request:Request,limit=1024*1024):Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('Request too large');}chunks.push(value);}
  const result=JSON.parse(Buffer.concat(chunks).toString());if(!result || typeof result!=='object' || Array.isArray(result))throw new Error('Invalid request');return result;
}
export function failure(error:unknown) { const message=error instanceof Error?error.message:'Request failed';return Response.json({error:message},{status:message==='Not authenticated'?401:400,headers:{'Cache-Control':'no-store'}}); }
