'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Ban, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/kitchen/api';
import { useMutation, useQuery } from '@/lib/kitchen/client';
import { PageLoader } from '@/components/ui/page-loader';
import { buttonClassName, cardClassName, cx, EmptyState, IconBadge, PageContainer, PageHeader, rowsClassName, Section } from '@/components/ui/kit';
import { errorMessage } from '@/components/community/safety/logic';

type Kind = 'recipe' | 'author';
type Entry = { key: string; label: string };

const backLinkClassName =
  '-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100';

export default function HiddenPage() {
  const hidden = useQuery(api.community.hidden, {});
  const hide = useMutation(api.community.hide);
  const running = useRef(new Set<string>());
  const [pending, setPending] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const result = useRef<HTMLParagraphElement>(null);

  if (hidden === undefined) return <PageLoader rows={3} />;

  const restore = async (kind: Kind, entry: Entry) => {
    const id = `${kind}:${entry.key}`;
    if (running.current.has(id)) return;
    running.current.add(id);
    setPending(current => [...current, id]);
    setStatus('');
    setError('');
    const name = entry.label || (kind === 'recipe' ? 'the recipe' : 'the cook');
    try {
      await hide({ kind, key: entry.key, label: entry.label, hidden: false });
      setStatus(kind === 'recipe' ? `“${name}” is back in the community.` : `Unblocked ${name}.`);
      // The row and its button are gone: focus goes to the result instead of being lost.
      window.setTimeout(() => result.current?.focus(), 0);
    } catch (failure) {
      setError(errorMessage(failure, kind === 'recipe' ? 'Couldn’t unhide the recipe. Try again.' : 'Couldn’t unblock the cook. Try again.'));
    } finally {
      running.current.delete(id);
      setPending(current => current.filter(value => value !== id));
    }
  };

  const list = (kind: Kind, entries: Entry[]) => (
    <ul className={cx(cardClassName, rowsClassName)}>
      {entries.map(entry => {
        const busy = pending.includes(`${kind}:${entry.key}`);
        const label = entry.label || (kind === 'recipe' ? 'Hidden recipe' : 'Blocked cook');
        return (
          <li key={entry.key} className="flex items-center gap-3 px-4 py-3">
            <IconBadge icon={kind === 'recipe' ? EyeOff : Ban} tone="neutral" />
            <span className="min-w-0 flex-1 break-words text-sm font-medium text-stone-900 dark:text-stone-100">{label}</span>
            <button type="button" disabled={busy} aria-busy={busy} onClick={() => void restore(kind, entry)} className={cx(buttonClassName('secondary'), 'min-h-11 shrink-0')}>
              {kind === 'recipe' ? 'Unhide' : 'Unblock'}
              <span className="sr-only"> {label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
  const empty = hidden.recipes.length === 0 && hidden.authors.length === 0;

  return (
    <PageContainer width="3xl">
      <PageHeader
        back={<Link className={backLinkClassName} href="/community/connect"><ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Community account</Link>}
        eyebrow="Recipe community"
        title="Hidden & blocked"
        description="Recipes you hid or reported and cooks you blocked don’t appear in the community for you. This list stays on your Sous Chef server."
      />
      <p ref={result} tabIndex={-1} role="status" className={cx('rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100', !status && 'hidden')}>{status}</p>
      <p role="alert" className={cx('rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100', !error && 'hidden')}>{error}</p>
      {empty ? (
        <div className={cardClassName}>
          <EmptyState icon={ShieldCheck} title="Nothing hidden or blocked" description="Use the More menu on a community recipe to hide it, report it or block its cook." action={<Link className={buttonClassName('secondary')} href="/community">Browse the community</Link>} />
        </div>
      ) : (
        <>
          {hidden.recipes.length > 0 && <Section title="Hidden recipes" id="hidden-recipes" aside={String(hidden.recipes.length)}>{list('recipe', hidden.recipes)}</Section>}
          {hidden.authors.length > 0 && <Section title="Blocked cooks" id="blocked-cooks" aside={String(hidden.authors.length)}>{list('author', hidden.authors)}</Section>}
        </>
      )}
    </PageContainer>
  );
}
