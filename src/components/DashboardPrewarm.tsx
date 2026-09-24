'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrewarmRoute } from '@/lib/kitchen/prewarm';
export function DashboardPrewarm({enabled,routes}:{enabled:boolean;routes:string[]}) {
  const router=useRouter(); const prewarm=usePrewarmRoute(); const key=routes.join('|');
  useEffect(() => {
    if(!enabled) return;
    const list=key.split('|');
    for(const route of list) router.prefetch(route);
    // Warm page data once the current page has settled, so switching tabs is instant.
    const run=() => { for(const route of list) prewarm(route); };
    if('requestIdleCallback' in window){const id=window.requestIdleCallback(run,{timeout:3000}); return () => window.cancelIdleCallback(id);}
    const id=setTimeout(run,1200); return () => clearTimeout(id);
  },[enabled,key,router,prewarm]);
  return null;
}
