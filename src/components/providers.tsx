'use client';
import { KitchenProvider } from '@/lib/kitchen/client';
export function Providers({children}:{children:React.ReactNode}) {return <KitchenProvider>{children}</KitchenProvider>;}
