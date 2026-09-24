'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuthActions } from '@/lib/kitchen/client';
import { IconBadge, buttonClassName, cx, headingFont } from '@/components/ui/kit';
export default function DemoPage() {
 const {signIn}=useAuthActions();const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <main className="mx-auto max-w-xl animate-fade-in px-4 py-8 sm:px-6">
  <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm shadow-stone-900/5 sm:p-8 dark:border-stone-800 dark:bg-stone-900/60">
   <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50" style={headingFont}>Try your own demo kitchen</h1>
   <p className="mt-3 text-base text-stone-600 dark:text-stone-400">Explore a sample pantry, cook a recipe, and make a shopping list. Your temporary kitchen is separate from every other visitor’s and expires after 24 hours.</p>
   <div className="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50/70 p-4 dark:bg-amber-950/30"><IconBadge icon={ShieldAlert} tone="warning" size="sm" /><p className="text-sm text-amber-950 dark:text-amber-100">Don’t add private information. Export any recipes you want to keep. Publishing requires a separate community account.</p></div>
   <button disabled={busy} className={cx(buttonClassName('primary'), 'mt-6 min-h-11 w-full')} onClick={async()=>{setBusy(true);try{await signIn('demo',{flow:'demo'});router.push('/inventory');}catch(e){setError(e instanceof Error?e.message:'Could not start demo');setBusy(false);}}}>{busy&&<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{busy?'Preparing your kitchen…':'Start demo'}</button>
   <p role="alert" className="mt-3 text-sm text-rose-700 empty:hidden dark:text-rose-300">{error}</p>
  </div>
 </main>;
}
