'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChefHat, Github, Leaf, BookOpen, ShoppingBasket } from 'lucide-react';
import { useAuthActions, useKitchenAuth } from '@/lib/kitchen/client';

export function DemoEntry() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useKitchenAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startDemo() {
    setBusy(true);
    setError('');
    try {
      await signIn('demo', { flow: 'demo' });
      router.push('/inventory');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start your demo. Please try again.');
      setBusy(false);
    }
  }

  return <main className="min-h-dvh bg-[#faf9f5] px-6 py-8 text-stone-800">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-4">
      <Link href="/demo" className="flex items-center gap-2 text-xl font-semibold"><ChefHat aria-hidden="true" />Sous Chef</Link>
      <a href="https://github.com/gamerg21/sous-chef" className="flex min-h-11 items-center gap-2 text-sm underline-offset-4 hover:underline"><Github size={18} aria-hidden="true" />GitHub</a>
    </header>
    <section className="mx-auto max-w-2xl py-16 sm:py-24">
      <h1 className="text-4xl font-medium leading-tight tracking-tight sm:text-5xl">Make yourself at home.</h1>
      <p className="mt-6 text-lg leading-relaxed text-stone-600">This is the real Sous Chef app, with a kitchen just for you. Explore, change things, and see how it feels to cook with a little help.</p>
      <div className="my-9 grid gap-5 sm:grid-cols-3">
        {[
          { icon: Leaf, title: 'A stocked kitchen', description: 'Explore your pantry, fridge, and freezer.' },
          { icon: BookOpen, title: 'Recipes to try', description: 'Cook a recipe and watch your stock update.' },
          { icon: ShoppingBasket, title: 'A smarter shop', description: 'Add missing ingredients, then stock purchases.' },
        ].map(({ icon: Icon, title, description }) => <div key={title}><Icon className="mb-3 text-emerald-800" aria-hidden="true" /><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-stone-600">{description}</p></div>)}
      </div>
      {isAuthenticated ? <Link href="/inventory" className="inline-flex min-h-12 items-center gap-5 rounded-lg bg-emerald-900 px-6 py-3 font-medium text-white">Continue to your kitchen<ArrowRight size={18} aria-hidden="true" /></Link> : <button type="button" disabled={busy || isLoading} onClick={() => void startDemo()} className="inline-flex min-h-12 items-center gap-5 rounded-lg bg-emerald-900 px-6 py-3 font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:opacity-60">{busy ? 'Preparing your kitchen…' : isLoading ? 'Checking your session…' : 'Start cooking'}<ArrowRight size={18} aria-hidden="true" /></button>}
      <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>
      <p className="mt-5 text-sm text-stone-600">No signup. No payment details. Your changes stay separate from other visitors.</p>
      <div className="mt-10 border-t border-stone-200 pt-6 text-sm leading-relaxed text-stone-600"><p>This is a temporary playground. Kitchens reset when the server restarts and expire within 24 hours. If your previous kitchen has gone, start a new one. Export recipes you want to keep, and don’t add personal information.</p><p className="mt-3">AI and instance administration are disabled. Community sharing needs a separately configured service. The free host may take about a minute to wake after being idle.</p></div>
    </section>
  </main>;
}
