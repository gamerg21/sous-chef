'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '@/lib/kitchen/client';
export default function DemoPage() {
 const {signIn}=useAuthActions();const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <main className="mx-auto max-w-xl space-y-5 p-8"><h1 className="text-3xl font-semibold">Try your own demo kitchen</h1><p>Explore a sample pantry, cook a recipe, and make a shopping list. Your temporary kitchen is separate from every other visitor’s and expires after 24 hours.</p><p>Don’t add private information. Export any recipes you want to keep. Publishing requires a separate community account.</p><button disabled={busy} className="rounded-lg bg-emerald-700 px-5 py-3 text-white" onClick={async()=>{setBusy(true);try{await signIn('demo',{flow:'demo'});router.push('/inventory');}catch(e){setError(e instanceof Error?e.message:'Could not start demo');setBusy(false);}}}>{busy?'Preparing your kitchen…':'Start demo'}</button><p role="alert">{error}</p></main>;
}
