import { BrandLogo } from '@/components/BrandLogo';
import Link from 'next/link';
import { ChefHat, ChevronDown, Clock, CloudOff, Download, Search, SearchX, User, Users } from 'lucide-react';
import { remote, communityOrigin } from '@/server/kitchen/community';
import { parseSnapshot, type Publication } from '@/lib/community-contract';
import { unitLabel } from '@/lib/units';
import { buttonClassName, cardClassName, cx, EmptyState, eyebrowClassName, fieldClassName, headingFont, PageHeader, Section } from '@/components/ui/kit';
export const dynamic='force-dynamic';
export default async function Explore({searchParams}:{searchParams:Promise<{q?:string}>}) {
 const {q}=await searchParams;let recipes:Publication[]=[];let available=!!communityOrigin();
 if(available)try{recipes=(await remote<{recipes:Publication[]}>(`recipes?search=${encodeURIComponent(q||'')}`)).recipes;recipes.forEach(r=>parseSnapshot(r.snapshot));}catch{available=false;}
 return (
  <main className="min-h-dvh bg-stone-50 dark:bg-stone-950">
   <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
    <Link className="inline-flex min-h-11 items-center gap-3 font-semibold text-stone-900 dark:text-stone-100" href="/" style={headingFont}><BrandLogo decorative />Sous Chef</Link>
    <PageHeader
     eyebrow="Recipe community"
     title="Recipes from the community"
     description="Download a recipe, then use Import in your local recipe library. No kitchen account is required to browse."
    />
    <form className="flex gap-2">
     <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
      <input aria-label="Search recipes" name="q" defaultValue={q} placeholder="Search recipes…" className={cx(fieldClassName, 'pl-10')} />
     </div>
     <button className={cx(buttonClassName('primary'), 'min-h-11')}>Search</button>
    </form>
    {!available ? (
     <div className={cardClassName} role="status">
      <EmptyState icon={CloudOff} title="Community unavailable" description="The community service is not connected or is temporarily unavailable." />
     </div>
    ) : recipes.length === 0 ? (
     <div className={cardClassName}>
      <EmptyState icon={SearchX} title="No recipes found." description="Be the first to share one from your kitchen." />
     </div>
    ) : (
     <Section title={q ? `Results for “${q}”` : 'Shared recipes'} aside={`${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`}>
      <div className="stagger grid gap-4 sm:grid-cols-2">
       {recipes.map(r => {
        const s = r.snapshot;
        return (
         <article key={r.id} className={cx(cardClassName, 'flex flex-col overflow-hidden')}>
          <div className="relative aspect-[16/9] bg-gradient-to-br from-emerald-50 to-stone-100 dark:from-emerald-950/40 dark:to-stone-900">
           {s.photoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- inline data URL from the publication snapshot
            <img src={s.photoDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
           ) : (
            <ChefHat aria-hidden="true" className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-emerald-600/40 dark:text-emerald-400/30" strokeWidth={1.5} />
           )}
          </div>
          <div className="flex flex-1 flex-col p-5">
           <h2 className="text-xl font-semibold leading-snug text-stone-900 dark:text-stone-100" style={headingFont}>{s.title}</h2>
           <p className="mt-1 inline-flex items-center gap-1 text-sm text-stone-500 dark:text-stone-400"><User className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />By {r.author.name}</p>
           {s.description && <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{s.description}</p>}
           {(s.totalTimeMinutes || s.servings || s.tags.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-500 dark:text-stone-400">
             {s.totalTimeMinutes ? <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />{s.totalTimeMinutes} min</span> : null}
             {s.servings ? <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />Serves {s.servings}</span> : null}
             {s.tags.slice(0, 3).map(t => <span key={t} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">{t}</span>)}
            </div>
           )}
           <details className="group mt-4 rounded-xl border border-stone-200 dark:border-stone-800">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-stone-800 dark:text-stone-200 [&::-webkit-details-marker]:hidden">
             View recipe
             <ChevronDown className="h-4 w-4 text-stone-400 transition-transform group-open:rotate-180" strokeWidth={1.75} aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-stone-200 px-4 py-4 dark:border-stone-800">
             <div>
              <h3 className={cx(eyebrowClassName, 'mb-2')}>Ingredients</h3>
              <ul className="divide-y divide-stone-100 dark:divide-stone-800">
               {s.ingredients.map((i, n) => {
                const amount = [typeof i.quantity === 'number' ? `${i.quantity}` : '', unitLabel(i.unit, i.quantity)].filter(Boolean).join(' ');
                return <li key={n} className="py-1.5 text-sm text-stone-800 dark:text-stone-200">{amount && <span className="font-semibold tabular-nums">{amount} </span>}{i.name}</li>;
               })}
              </ul>
             </div>
             <div>
              <h3 className={cx(eyebrowClassName, 'mb-2')}>Steps</h3>
              <ol className="space-y-3">
               {s.steps.map((step, n) => (
                <li key={n} className="flex gap-3 text-sm leading-relaxed text-stone-800 dark:text-stone-200">
                 <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">{n + 1}</span>
                 <span className="pt-0.5">{step.text}</span>
                </li>
               ))}
              </ol>
             </div>
            </div>
           </details>
           <div className="mt-auto pt-4">
            <a className={cx(buttonClassName('soft'), 'min-h-11 w-full')} href={`/api/community/recipes/${encodeURIComponent(r.id)}`}><Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Download recipe</a>
           </div>
          </div>
         </article>
        );
       })}
      </div>
     </Section>
    )}
    <Link className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400" href="/inventory">Open your kitchen to publish a recipe</Link>
   </div>
  </main>
 );
}
