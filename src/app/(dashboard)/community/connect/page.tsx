'use client';
import { useState } from 'react';
import { useAction, useMutation, useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api as communityApi } from '../../../../../convex/_generated/api';
import { api } from '@/lib/kitchen/api';
import { request } from '@/lib/kitchen/client';
import Link from 'next/link';
import {CommunityAccountProvider} from '@/components/community/CommunityAccountProvider';
function ConnectForm() {
  const {isAuthenticated}=useConvexAuth();const {signIn,signOut}=useAuthActions();
  const issueToken=useAction(communityApi.hub.issueToken);const revoke=useMutation(communityApi.hub.revokeTokens);
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const run=async(fn:()=>Promise<unknown>,success:string)=>{setBusy(true);setMessage('');try{await fn();setMessage(success);}catch(error){setMessage(error instanceof Error?error.message:'Connection failed');}finally{setBusy(false);}};
  return <div className="space-y-4">
    <h1 className="text-2xl font-semibold">Connect to the recipe community</h1>
    <p>Your community account is separate from your private kitchen. Only recipes you choose to publish are uploaded.</p>
    {!isAuthenticated?<form className="space-y-3" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void run(()=>signIn('password',data),'Signed in. You can now connect this kitchen.');}}>
      <label className="block">Display name<input name="name" autoComplete="name" className="block w-full rounded border p-2" /></label>
      <label className="block">Community email<input name="email" type="email" autoComplete="email" required className="block w-full rounded border p-2" /></label>
      <label className="block">Community password<input name="password" type="password" autoComplete="current-password" required minLength={8} className="block w-full rounded border p-2" /></label>
      <label className="block">Account<select name="flow" className="ml-3 rounded border p-2"><option value="signIn">Sign in</option><option value="signUp">Create account</option></select></label>
      <button disabled={busy} className="rounded bg-emerald-700 px-4 py-3 text-white">Continue</button>
    </form>:<div className="flex flex-wrap gap-3">
      <button disabled={busy} className="rounded bg-emerald-700 px-4 py-3 text-white" onClick={()=>void run(async()=>{const token=await issueToken({});await request(api.community.setConnection,{token});},'Connected. You can publish recipes from your library.')}>Connect this kitchen</button>
      <button disabled={busy} className="rounded border px-4 py-3" onClick={()=>void run(()=>signOut(),'Signed out of the community account.')}>Sign out of community</button>
      <button disabled={busy} className="rounded border px-4 py-3" onClick={()=>void run(async()=>{await revoke({});await request(api.community.setConnection,{token:''});},'All community publishing connections revoked.')}>Revoke all connections</button>
    </div>}
    <Link className="block underline" href="/community-account/recovery">Forgot your community password?</Link>
    <p role="status">{message}</p><Link className="underline" href="/community">Back to community</Link>
  </div>;
}
export default function ConnectPage() { return <main className="mx-auto max-w-xl p-6"><CommunityAccountProvider><ConnectForm/></CommunityAccountProvider></main>; }
