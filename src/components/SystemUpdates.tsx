'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/confirm-modal';

export interface UpdateStatus {
  installedVersion: string; buildRevision: string; available: boolean; managed: boolean; admin: boolean; demo: boolean;
  latest: { version: string; url: string; notes: string } | null;
  checkedAt: string; error: string | null;
  job: { id?: string; version?: string; phase: string; message: string } | null;
}
const finished = ['idle', 'complete', 'failed', 'recovery-required'];
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-stone-700';
export function UpdateNotice() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState('');
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const response = await fetch('/api/system/updates');
        if (response.ok && alive) setStatus(await response.json());
      } catch { /* Updates never interrupt normal kitchen use. */ }
    };
    void check();
    const timer = setInterval(check, 30 * 60000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  if (!status?.admin || !status.available || !status.latest || status.demo || dismissed === status.latest.version) return null;
  return <div className="flex items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
    <Link href="/settings/system" className="underline underline-offset-4">Sous Chef {status.latest.version} is available. Review update</Link>
    <button aria-label="Dismiss update notification" className="p-2" onClick={() => setDismissed(status.latest!.version)}><X size={18} /></button>
  </div>;
}
export default function SystemUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [queued, setQueued] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [started, setStarted] = useState(0);
  const active = !!queued || !!(status?.job && !finished.includes(status.job.phase));
  const refresh = useCallback(async () => {
    const response = await fetch('/api/system/updates', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Couldn’t load update settings. Try again.');
    const next: UpdateStatus = await response.json();
    setStatus(next); setReconnecting(false);
    if (next.job && (next.job.phase === 'complete' || next.job.phase === 'failed')) setQueued(id => !id || id === next.job?.id ? '' : id);
    return next;
  }, []);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try { await refresh(); } catch (error) {
        if (!alive) return;
        if (active) setReconnecting(true);
        else setError(error instanceof Error ? error.message : 'Couldn’t load update settings.');
      }
    };
    void check();
    const timer = setInterval(check, active ? 2000 : 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [active, refresh]);
  async function act(action: 'check' | 'install') {
    setBusy(true); setError(''); setConfirm(false);
    try {
      const response = await fetch('/api/system/updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, version: status?.latest?.version }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Couldn’t complete this request.');
      if (action === 'install') { setQueued(result.id); setStarted(Date.now()); }
      else await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : 'Couldn’t complete this request.'); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-3xl space-y-6 px-5 py-8 sm:px-8">
    <div><h1 className="text-2xl font-semibold">System & Updates</h1><p className="mt-2 text-sm text-stone-600 dark:text-stone-400">Keep your kitchen up to date.</p></div>
    {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-950 dark:text-red-200">{error} <button className="underline" onClick={() => { setError(''); void refresh().catch(() => setError('Couldn’t reconnect. Try again.')); }}>Retry</button></div>}
    {!status ? <p role="status">Loading version information…</p> : <>
      <section className="space-y-5 rounded-xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-950">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-medium">Sous Chef {status.installedVersion}</h2><p className="mt-1 text-sm text-stone-500">{status.buildRevision === 'local' ? 'Local build' : `Build ${status.buildRevision.slice(0, 12)}`}</p></div>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-sm dark:bg-stone-800">{status.error ? 'Check unavailable' : status.available ? 'Update available' : status.latest ? 'Up to date' : 'No published release yet'}</span></div>
        {status.error && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{status.error}</p>}
        <p className="text-sm text-stone-600 dark:text-stone-400">Last checked: {new Date(status.checkedAt).toLocaleString()}. Checks run periodically while the app is in use and contact GitHub. Kitchen data is never included.</p>
        <div className="flex flex-wrap gap-3"><button className={button} disabled={busy || active || !status.admin} onClick={() => void act('check')}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />Check now</button>
          {status.available && status.managed && status.admin && <button className={`${button} bg-emerald-700 text-white`} disabled={busy || active || !!status.error || status.job?.phase === 'recovery-required'} onClick={() => setConfirm(true)}><Download size={16} />Update to {status.latest?.version}</button>}</div>
        {!status.admin && <p className="text-sm text-stone-500">{status.demo ? 'Updates are managed by the demo operator.' : 'Only the instance administrator can check manually or install updates.'}</p>}
      </section>
      {(active || status.job?.phase === 'complete' || status.job?.phase === 'failed' || status.job?.phase === 'recovery-required') && <section aria-live="polite" className="rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <p className="font-medium">{reconnecting ? 'Restarting your kitchen…' : queued && (!status.job || finished.includes(status.job.phase)) ? 'Update queued…' : status.job?.message}</p>
        {active && <p className="mt-2 text-sm text-stone-500">This page reconnects automatically. Keep the server running.</p>}
        {active && started > 0 && Date.now() - started > 5 * 60000 && <p className="mt-2 text-sm">This is taking longer than expected. Check the updater on the server before retrying.</p>}
        {status.job?.phase === 'complete' && !active && <button className={`${button} mt-3`} onClick={() => window.location.reload()}>Reload updated app</button>}
      </section>}
      {status.available && status.latest && <section className="space-y-3 rounded-xl border border-stone-200 p-6 dark:border-stone-800"><h2 className="text-lg font-medium">What’s new in {status.latest.version}</h2><p className="whitespace-pre-wrap break-words text-sm text-stone-600 dark:text-stone-400">{status.latest.notes || 'Release notes are available on GitHub.'}</p><a href={status.latest.url} target="_blank" rel="noreferrer" className="inline-block text-sm underline">View release on GitHub</a></section>}
      {!status.managed && status.admin && <section className="space-y-3 rounded-xl border border-stone-200 p-6 dark:border-stone-800"><h2 className="text-lg font-medium">Enable one-button updates</h2><p className="text-sm text-stone-600 dark:text-stone-400">Connect the updater once on the computer running Sous Chef. It backs up your kitchen, installs the release, and checks that the app restarts successfully.</p><a className="inline-block text-sm underline" href="https://github.com/gamerg21/sous-chef/blob/main/docs/UPDATES.md" target="_blank" rel="noreferrer">Setup and manual update instructions</a></section>}
    </>}
    <div className="flex flex-wrap gap-5 text-sm"><Link className="underline" href="/settings/household-users">Household members</Link><Link className="underline" href="/settings/ai">AI settings</Link></div>
    <ConfirmModal isOpen={confirm} onClose={() => setConfirm(false)} onConfirm={() => void act('install')} title={`Update to ${status?.latest?.version}?`} message="Your kitchen will be backed up automatically. Everyone will briefly lose access while the app restarts. Finish any cooking or edits before continuing." confirmText="Back up and update" />
  </div>;
}
