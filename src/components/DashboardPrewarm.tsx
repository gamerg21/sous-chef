'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export function DashboardPrewarm({enabled,routes}:{enabled:boolean;routes:string[]}) {
  const router=useRouter(); const key=routes.join('|');
  useEffect(() => {if(enabled) for(const route of key.split('|')) router.prefetch(route);},[enabled,key,router]);
  return null;
}
