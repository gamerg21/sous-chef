'use client';
import {Suspense,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useAuthActions} from '@convex-dev/auth/react';
import {CommunityAccountProvider} from '@/components/community/CommunityAccountProvider';
import Link from 'next/link';
import {AppSplash} from '@/components/ui/page-loader';
import {eyebrowClassName} from '@/components/ui/kit';
import {AuthCard,authInputClassName,authQuietLinkClassName,authSubmitClassName} from '@/app/auth/auth-card';
function Recovery() {
 const params=useSearchParams();const code=params.get('code');const {signIn}=useAuthActions();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 return <AuthCard title="Recover your community account" description="This changes your community password, not the password for your local kitchen." footer={<Link href="/community/connect" className={authQuietLinkClassName}>Back to community connection</Link>}>
 <form className="space-y-5" onSubmit={async e=>{e.preventDefault();setBusy(true);const data=new FormData(e.currentTarget);const email=String(data.get('email')||'');try{await signIn('password',code?{flow:'reset-verification',email,code,newPassword:String(data.get('password')||'')}:{flow:'reset',email,redirectTo:`/community-account/recovery?email=${encodeURIComponent(email)}`});setMessage(code?'Community password updated. Return to the connection screen.':'If your account exists and email is configured, a reset link will arrive shortly. Otherwise contact the community operator.');}catch{setMessage('Could not complete community recovery. Check the link or contact the community operator.');}finally{setBusy(false);}}}>
 <label className="block"><span className={eyebrowClassName}>Community email</span><input name="email" type="email" required defaultValue={params.get('email')||''} className={authInputClassName}/></label>
 {code&&<label className="block"><span className={eyebrowClassName}>New community password</span><input name="password" type="password" minLength={8} maxLength={128} required autoComplete="new-password" className={authInputClassName}/></label>}
 <button disabled={busy} className={authSubmitClassName}>{code?'Update community password':'Request reset link'}</button><p role="status" className="rounded-xl bg-stone-100 px-3 py-2.5 text-sm text-stone-700 empty:hidden dark:bg-stone-800/60 dark:text-stone-300">{message}</p>
 </form></AuthCard>;
}
export default function Page(){return <CommunityAccountProvider><Suspense fallback={<AppSplash/>}><Recovery/></Suspense></CommunityAccountProvider>;}
