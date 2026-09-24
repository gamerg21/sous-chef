'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ConvexReactClient} from 'convex/react';
import {ConvexAuthProvider} from '@convex-dev/auth/react';
export function CommunityAccountProvider({children}:{children:ReactNode}) {
 const [client,setClient]=useState<ConvexReactClient>();const [message,setMessage]=useState('Loading community configuration…');
 useEffect(()=>{let connection:ConvexReactClient|undefined;let active=true;void fetch('/api/config').then(r=>r.json()).then(config=>{if(!active)return;if(!config.communityConvexUrl){setMessage('This instance has not configured a community account service. Your local kitchen is ready to use.');return;}connection=new ConvexReactClient(config.communityConvexUrl);setClient(connection);}).catch(()=>setMessage('Community configuration could not load.'));return()=>{active=false;void connection?.close();};},[]);
 return client?<ConvexAuthProvider client={client} shouldHandleCode={false}>{children}</ConvexAuthProvider>:<p role="status" className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-300">{message}</p>;
}
