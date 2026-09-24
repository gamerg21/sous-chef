'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { useAuthActions, useKitchenAuth } from '@/lib/kitchen/client';

export function DemoEntry() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useKitchenAuth();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace('/inventory');
      return;
    }
    // Auth updates and Strict Mode must not create additional visitor kitchens.
    if (started.current) return;
    started.current = true;
    void signIn('demo', { flow: 'demo' }).then(() => {
      router.replace('/inventory');
    }).catch((error: unknown) => {
      setError(error instanceof Error ? error.message : 'Could not open your demo kitchen.');
    });
  }, [isAuthenticated, isLoading, router, signIn]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#faf9f5] px-6 text-stone-800">
      {error ? (
        <div className="max-w-sm text-center">
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-5 min-h-11 rounded-lg bg-emerald-900 px-5 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800">Try again</button>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-3 text-sm text-stone-600">
          <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
          Opening your kitchen…
        </p>
      )}
    </main>
  );
}
