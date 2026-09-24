'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Download, Loader2, RefreshCw, Sparkles, Wrench, X } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { IconBadge, PageHeader, Pill, Section, StatusDot, buttonClassName, cardClassName, cx, headingFont, heroCardClassName, iconButtonClassName, rowsClassName, type Tone } from '@/components/ui/kit';

export interface UpdateStatus {
  installedVersion: string; buildRevision: string; available: boolean; managed: boolean; admin: boolean; demo: boolean;
  latest: { version: string; url: string; notes: string } | null;
  checkedAt: string; error: string | null;
  job: { id?: string; version?: string; phase: string; message: string } | null;
}
const SpinningLoader = ({ className, strokeWidth }: { className?: string; strokeWidth?: number }) => <Loader2 className={cx(className, 'animate-spin')} strokeWidth={strokeWidth} />;
const finished = ['idle', 'complete', 'failed', 'recovery-required'];
const quietLink = 'inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200';
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
  return <div className="px-4 pt-4 sm:px-6">
    <div className="animate-fade-in mx-auto flex max-w-6xl items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 pl-4 dark:border-emerald-900 dark:bg-emerald-950/40">
      <IconBadge icon={Sparkles} tone="success" />
      <Link href="/settings/system" className="min-w-0 flex-1 text-sm text-emerald-950 dark:text-emerald-100">
        <span className="font-medium">Sous Chef {status.latest.version} is available.</span>{' '}
        <span className="underline underline-offset-4">Review update</span>
      </Link>
      <button aria-label="Dismiss update notification" className={iconButtonClassName} onClick={() => setDismissed(status.latest!.version)}><X size={18} /></button>
    </div>
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
  const statusLabel = status ? (status.error ? 'Check unavailable' : status.available ? 'Update available' : status.latest ? 'Up to date' : 'No published release yet') : '';
  const statusTone: Tone = !status ? 'neutral' : status.error ? 'warning' : status.available ? 'info' : status.latest ? 'success' : 'neutral';
  const jobPhase = status?.job?.phase;
  const showJob = !!status && (active || jobPhase === 'complete' || jobPhase === 'failed' || jobPhase === 'recovery-required');
  const jobFailed = jobPhase === 'failed' || jobPhase === 'recovery-required';
  return <div className="space-y-8">
    <PageHeader title="System & Updates" description="Keep your kitchen up to date." />
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1">{error}</span> <button className={buttonClassName('secondary', 'sm')} onClick={() => { setError(''); void refresh().catch(() => setError('Couldn’t reconnect. Try again.')); }}>Retry</button></div>}
    {!status ? <div className={cx(heroCardClassName, 'space-y-3 p-5')}><p role="status" className="sr-only">Loading version information…</p><div aria-hidden="true" className="skeleton h-7 w-48" /><div aria-hidden="true" className="skeleton h-4 w-72 max-w-full" /><div aria-hidden="true" className="skeleton h-11 w-32" /></div> : <>
      <section aria-label="Installed version" className={heroCardClassName}>
        <div className="flex flex-wrap items-center gap-4 p-5">
          <IconBadge icon={status.available ? Download : status.error ? AlertTriangle : CheckCircle2} tone={statusTone === 'neutral' ? 'success' : statusTone} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100" style={headingFont}>Sous Chef {status.installedVersion}</h2>
            <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{status.buildRevision === 'local' ? 'Local build' : `Build ${status.buildRevision.slice(0, 12)}`}</p>
          </div>
          <Pill tone={statusTone}><StatusDot tone={statusTone} />{statusLabel}</Pill>
        </div>
        <div className={cx(rowsClassName, 'border-t border-stone-200 dark:border-stone-800')}>
          {status.error && <p role="status" className="flex items-start gap-2 px-5 py-3 text-sm text-amber-700 dark:text-amber-300"><StatusDot tone="warning" />{status.error}</p>}
          <p className="px-5 py-3 text-sm text-stone-600 dark:text-stone-400">Last checked: {new Date(status.checkedAt).toLocaleString()}. Checks run periodically while the app is in use and contact GitHub. Kitchen data is never included.</p>
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <button className={cx(buttonClassName('secondary'), 'min-h-11')} disabled={busy || active || !status.admin} onClick={() => void act('check')}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />Check now</button>
            {status.available && status.managed && status.admin && <button className={cx(buttonClassName('primary'), 'min-h-11')} disabled={busy || active || !!status.error || status.job?.phase === 'recovery-required'} onClick={() => setConfirm(true)}><Download size={16} />Update to {status.latest?.version}</button>}
            {!status.admin && <p className="text-sm text-stone-500 dark:text-stone-400">{status.demo ? 'Updates are managed by the demo operator.' : 'Only the instance administrator can check manually or install updates.'}</p>}
          </div>
        </div>
      </section>
      {showJob && <section aria-live="polite" className={cx(cardClassName, 'animate-fade-in flex items-start gap-3 p-5')}>
        <IconBadge icon={active ? SpinningLoader : jobFailed ? AlertTriangle : CheckCircle2} tone={active ? 'info' : jobFailed ? 'danger' : 'success'} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-stone-900 dark:text-stone-100">{reconnecting ? 'Restarting your kitchen…' : queued && (!status.job || finished.includes(status.job.phase)) ? 'Update queued…' : status.job?.message}</p>
          {active && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">This page reconnects automatically. Keep the server running.</p>}
          {active && started > 0 && Date.now() - started > 5 * 60000 && <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">This is taking longer than expected. Check the updater on the server before retrying.</p>}
          {status.job?.phase === 'complete' && !active && <button className={cx(buttonClassName('primary'), 'mt-3 min-h-11')} onClick={() => window.location.reload()}>Reload updated app</button>}
        </div>
      </section>}
      {status.available && status.latest && <Section title={`What’s new in ${status.latest.version}`}><div className={cx(cardClassName, 'space-y-2 p-5')}><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-700 dark:text-stone-300">{status.latest.notes || 'Release notes are available on GitHub.'}</p><a href={status.latest.url} target="_blank" rel="noreferrer" className={quietLink}>View release on GitHub<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></div></Section>}
      {!status.managed && status.admin && <Section title="Enable one-button updates"><div className={cx(cardClassName, 'flex items-start gap-3 p-5')}><IconBadge icon={Wrench} tone="neutral" /><div className="min-w-0 flex-1"><p className="text-sm text-stone-600 dark:text-stone-400">Connect the updater once on the computer running Sous Chef. It backs up your kitchen, installs the release, and checks that the app restarts successfully.</p><a className={quietLink} href="https://github.com/gamerg21/sous-chef/blob/main/docs/UPDATES.md" target="_blank" rel="noreferrer">Setup and manual update instructions<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a></div></div></Section>}
    </>}
    <ConfirmModal isOpen={confirm} onClose={() => setConfirm(false)} onConfirm={() => void act('install')} title={`Update to ${status?.latest?.version}?`} message="Your kitchen will be backed up automatically. Everyone will briefly lose access while the app restarts. Finish any cooking or edits before continuing." confirmText="Back up and update" />
  </div>;
}
