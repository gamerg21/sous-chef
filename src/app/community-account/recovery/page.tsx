'use client';
import {Suspense,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useAuthActions} from '@convex-dev/auth/react';
import {CommunityAccountProvider} from '@/components/community/CommunityAccountProvider';
import Link from 'next/link';
function Recovery() {
 const params=useSearchParams();const code=params.get('code');const {signIn}=useAuthActions();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 return <form className="space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);const data=new FormData(e.currentTarget);const email=String(data.get('email')||'');try{await signIn('password',code?{flow:'reset-verification',email,code,newPassword:String(data.get('password')||'')}:{flow:'reset',email,redirectTo:`/community-account/recovery?email=${encodeURIComponent(email)}`});setMessage(code?'Community password updated. Return to the connection screen.':'If your account exists and email is configured, a reset link will arrive shortly. Otherwise contact the community operator.');}catch{setMessage('Could not complete community recovery. Check the link or contact the community operator.');}finally{setBusy(false);}}}>
 <h1 className="text-2xl font-semibold">Recover your community account</h1><p>This changes your community password, not the password for your local kitchen.</p>
 <label className="block">Community email<input name="email" type="email" required defaultValue={params.get('email')||''} className="mt-1 block w-full rounded border p-3"/></label>
 {code&&<label className="block">New community password<input name="password" type="password" minLength={8} maxLength={128} required autoComplete="new-password" className="mt-1 block w-full rounded border p-3"/></label>}
 <button disabled={busy} className="rounded bg-emerald-700 px-4 py-3 text-white">{code?'Update community password':'Request reset link'}</button><p role="status">{message}</p><Link href="/community/connect" className="underline">Back to community connection</Link>
 </form>;
}
export default function Page(){return <main className="mx-auto max-w-xl p-6"><CommunityAccountProvider><Suspense fallback={<p>Loading…</p>}><Recovery/></Suspense></CommunityAccountProvider></main>;}
