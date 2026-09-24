'use client';
import { createContext, useContext, useCallback, useState, useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery as useReactQuery, useQueryClient } from '@tanstack/react-query';
import type { Ref } from '../../server/kitchen/_generated/server';
export async function request<A, R>(ref: Ref<A, R>, args: A): Promise<R> {
  const response = await fetch('/api/kitchen', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:ref.path,args})});
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Your kitchen could not complete this request'); return result.value;
}
const AuthContext = createContext({isAuthenticated:false, isLoading:true, demo:false, demoMode:false});
function AuthState({children}:{children:ReactNode}) {
  const auth = useReactQuery({queryKey:['session'], queryFn:async () => { const res = await fetch('/api/auth',{cache:'no-store'}); if (!res.ok) throw new Error('Cannot load your session'); return res.json() as Promise<{authenticated:boolean;demo:boolean;demoMode:boolean}>; }, retry:1, refetchInterval:30000});
  if (auth.error) return <main className="p-8" role="alert">Cannot connect to your kitchen. <button onClick={() => void auth.refetch()}>Try again</button></main>;
  return <AuthContext.Provider value={{isAuthenticated:!!auth.data?.authenticated,isLoading:auth.isPending,demo:!!auth.data?.demo,demoMode:!!auth.data?.demoMode}}>{children}</AuthContext.Provider>;
}
export function KitchenProvider({children}:{children:ReactNode}) {
  const [client] = useState(() => new QueryClient({defaultOptions:{queries:{retry:1, refetchOnWindowFocus:true}}}));
  return <QueryClientProvider client={client}><AuthState>{children}</AuthState></QueryClientProvider>;
}
export const useKitchenAuth = () => useContext(AuthContext);
export function useQuery<A, R>(ref:Ref<A,R>, args: A | 'skip' = {} as A): R | undefined {
  const auth = useKitchenAuth();
  const result = useReactQuery({queryKey:['kitchen',ref.path,args],queryFn:() => request(ref,args as A),enabled:args !== 'skip' && auth.isAuthenticated,refetchInterval:ref.path.startsWith('community:') ? 60000 : 5000,throwOnError:true});
  return args === 'skip' || !auth.isAuthenticated ? undefined : result.data;
}
export function useMutation<A,R>(ref:Ref<A,R>): (args:A) => Promise<R> {
  const client = useQueryClient(); const path = ref.path;
  return useCallback(async (args:A) => { const result = await request<A,R>({path},args); await client.invalidateQueries({queryKey:['kitchen']}); return result; },[client,path]);
}
export const useAction = useMutation;
export function useKitchen() { return useMemo(() => ({query:request, mutation:request, action:request}),[]); }
export function useAuthActions() {
  const client=useQueryClient();
  const perform = useCallback(async (body:Record<string,unknown>) => { const res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await res.json();if(!res.ok)throw new Error(result.error || 'Authentication failed');client.removeQueries({queryKey:['kitchen']});await client.invalidateQueries({queryKey:['session']});return result as {signingIn:boolean}; },[client]);
  return useMemo(() => ({signIn:(_provider:string, args:FormData|Record<string,unknown>) => perform(args instanceof FormData ? Object.fromEntries(args.entries()):args),signOut:() => perform({flow:'signOut'})}),[perform]);
}
