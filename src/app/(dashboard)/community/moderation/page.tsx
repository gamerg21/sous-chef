'use client';
import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft, CloudOff, Inbox, KeyRound, ShieldOff, Star } from 'lucide-react';
import { REPORT_REASON_LABELS, type ModAction, type Report, type ReportStatus } from '@/lib/community-contract';
import { api } from '@/lib/kitchen/api';
import { request, useMutation, useQuery } from '@/lib/kitchen/client';
import { PageLoader } from '@/components/ui/page-loader';
import { buttonClassName, cardClassName, cx, EmptyState, eyebrowClassName, PageContainer, PageHeader, Pill, SegmentedControl } from '@/components/ui/kit';
import { ConfirmDialog } from '@/components/community/safety/ConfirmDialog';
import { ageLabel, errorMessage, failureKind, GUIDELINES_URL, MOD_ACTION_LABELS, modActionsFor, modConfirmation, remaining } from '@/components/community/safety/logic';

const REASON_LIMIT = 500;
const STATUSES: { value: ReportStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
];
const DONE: Record<ModAction, string> = { dismiss: 'Report dismissed.', remove_recipe: 'Recipe removed.', remove_tip: 'Tip removed.', ban_user: 'Cook banned.' };

const backLinkClassName =
  '-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100';
const linkClassName = 'font-medium text-emerald-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-400';
const back = <Link className={backLinkClassName} href="/community/connect"><ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Community account</Link>;

/** What everyone but a moderator sees, whatever the reason. */
function NotAvailable() {
  return (
    <PageContainer width="3xl">
      <PageHeader back={back} eyebrow="Recipe community" title="Moderation" />
      <div className={cardClassName}>
        <EmptyState icon={ShieldOff} title="This page isn’t available" description="The moderation queue is only for community moderators." action={<Link className={buttonClassName('secondary')} href="/community">Back to the community</Link>} />
      </div>
    </PageContainer>
  );
}

function ReportCard({ report, now, onAct }: { report: Report; now: number; onAct: (action: ModAction) => void }) {
  const actions = modActionsFor(report);
  const age = ageLabel(report.createdAt, now);
  return (
    <li className={cx(cardClassName, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="danger">{REPORT_REASON_LABELS[report.reason]}</Pill>
        <Pill tone="neutral">{report.tip ? 'Tip' : 'Recipe'}</Pill>
        {report.status === 'open' && <Pill tone={report.reportCount > 1 ? 'warning' : 'neutral'}>{report.reportCount} open report{report.reportCount === 1 ? '' : 's'}</Pill>}
        {age && <time dateTime={report.createdAt} title={new Date(report.createdAt).toLocaleString()} className="ml-auto text-xs text-stone-600 dark:text-stone-400">Reported {age}</time>}
      </div>

      {report.recipe ? (
        <div className="min-w-0">
          <p className={eyebrowClassName}>Recipe</p>
          <p className="mt-0.5 break-words text-base font-semibold text-stone-900 dark:text-stone-100">
            <Link className={linkClassName} href={`/community/recipes/${encodeURIComponent(report.recipe.id)}`}>{report.recipe.title || 'Untitled recipe'}</Link>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
            <span className="break-words">By {report.recipe.author.name || 'Community cook'}</span>
            {report.recipe.underReview ? <Pill tone="warning">Under review: hidden until resolved</Pill> : <Pill tone="neutral">{report.recipe.visibility === 'public' ? 'Public' : report.recipe.visibility === 'unlisted' ? 'Unlisted' : report.recipe.visibility === 'private' ? 'Not published' : report.recipe.visibility}</Pill>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-600 dark:text-stone-400">The recipe no longer exists.</p>
      )}

      {report.tip && (
        <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-stone-800/50">
          <p className={eyebrowClassName}>Reported tip</p>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-stone-900 dark:text-stone-100">{report.tip.tip || 'This tip has no text.'}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-stone-600 dark:text-stone-400">
            <span className="break-words">By {report.tip.author.name || 'Community cook'}</span>
            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-500" strokeWidth={1.75} aria-hidden="true" />Rated {report.tip.rating} of 5</span>
          </p>
        </div>
      )}

      <div className="min-w-0">
        <p className={eyebrowClassName}>Reporter’s note</p>
        <p className={cx('mt-1 whitespace-pre-line break-words text-sm', report.note ? 'text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400')}>{report.note || 'No note.'}</p>
      </div>

      {report.status !== 'open' && (
        <div className="min-w-0 border-t border-stone-200 pt-3 text-sm text-stone-700 dark:border-stone-800 dark:text-stone-300">
          <p>
            <span className="font-medium">{report.status === 'actioned' ? 'Actioned' : 'Dismissed'}</span>
            {report.resolvedAt && ageLabel(report.resolvedAt, now) && <> <time dateTime={report.resolvedAt}>{ageLabel(report.resolvedAt, now)}</time></>}
          </p>
          {report.resolution && <p className="mt-1 whitespace-pre-line break-words">{report.resolution}</p>}
        </div>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
          {actions.map(action => (
            <button key={action} type="button" aria-haspopup="dialog" onClick={() => onAct(action)} className={cx(buttonClassName('secondary'), 'min-h-11', action !== 'dismiss' && 'text-rose-700 dark:text-rose-300')}>
              {MOD_ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Queue() {
  const reasonId = useId();
  const [status, setStatus] = useState<ReportStatus>('open');
  const [now] = useState(() => Date.now());
  const [acting, setActing] = useState<{ report: Report; action: ModAction } | null>(null);
  const [reason, setReason] = useState('');
  const [gone, setGone] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const result = useRef<HTMLParagraphElement>(null);
  const resolve = useMutation(api.community.modResolve);
  // Under the "kitchen" key, so resolving a report reloads the queue.
  const reports = useInfiniteQuery({
    queryKey: ['kitchen', 'community:modReports', status],
    queryFn: ({ pageParam }) => request(api.community.modReports, { status, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.cursor,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const failure = reports.error ? failureKind(reports.error.message) : null;
  if (failure === 'forbidden') return <NotAvailable />;

  const rows = (reports.data?.pages.flatMap(page => page.reports) ?? []).filter((report, index, all) => !(status === 'open' && gone.includes(report.id)) && all.findIndex(other => other.id === report.id) === index);
  const confirmation = acting && modConfirmation(acting.report, acting.action);
  const left = remaining(reason, REASON_LIMIT);

  let body;
  if (reports.isPending) {
    body = <div role="status" className={cx(cardClassName, 'px-4 py-10 text-center text-sm text-stone-600 dark:text-stone-400')}>Loading reports…</div>;
  } else if (reports.error && !reports.data) {
    body = failure === 'connect' || failure === 'reconnect' ? (
      <div className={cardClassName} role="alert">
        <EmptyState icon={KeyRound} title={failure === 'reconnect' ? 'Your community sign-in has expired' : 'Connect your community account'} description="Connect this kitchen to your community account again to open the moderation queue." action={<Link className={buttonClassName('primary')} href="/community/connect">Open community account</Link>} />
      </div>
    ) : (
      <div className={cardClassName} role="alert">
        <EmptyState icon={CloudOff} title="Couldn’t load reports" description={errorMessage(reports.error)} action={<button type="button" className={buttonClassName('secondary')} onClick={() => void reports.refetch()}>Try again</button>} />
      </div>
    );
  } else if (rows.length === 0 && !reports.hasNextPage) {
    body = (
      <div className={cardClassName}>
        <EmptyState icon={Inbox} title={status === 'open' ? 'No open reports' : status === 'actioned' ? 'No actioned reports' : 'No dismissed reports'} description={status === 'open' ? 'Nothing is waiting for review.' : undefined} />
      </div>
    );
  } else if (rows.length > 0) {
    body = (
      <ul className="space-y-3" aria-label={`${STATUSES.find(option => option.value === status)?.label} reports`}>
        {rows.map(report => <ReportCard key={report.id} report={report} now={now} onAct={action => { setReason(''); setMessage(''); setActing({ report, action }); }} />)}
      </ul>
    );
  }

  return (
    <PageContainer width="3xl">
      <PageHeader
        back={back}
        eyebrow="Recipe community"
        title="Moderation"
        description={<>Reports from cooks, checked against the <a className={linkClassName} href={GUIDELINES_URL} target="_blank" rel="noopener noreferrer">community guidelines<span className="sr-only"> (opens in a new tab)</span></a>.</>}
      />
      <SegmentedControl label="Report status" value={status} onChange={value => { setStatus(value); setMessage(''); }} options={STATUSES} />
      <p ref={result} tabIndex={-1} role="status" className={cx('rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100', !message && 'hidden')}>{message}</p>
      {reports.error && reports.data && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          Couldn’t refresh the queue: {errorMessage(reports.error)}
        </p>
      )}
      {body}
      {reports.hasNextPage && (
        <div className="flex justify-center">
          <button type="button" disabled={reports.isFetchingNextPage} aria-busy={reports.isFetchingNextPage} onClick={() => void reports.fetchNextPage()} className={cx(buttonClassName('secondary'), 'min-h-11')}>
            {reports.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
      <ConfirmDialog
        isOpen={!!acting}
        onClose={() => setActing(null)}
        title={confirmation?.title ?? ''}
        message={confirmation?.message ?? ''}
        confirmText={confirmation?.confirmText ?? ''}
        danger={confirmation?.danger}
        onConfirm={async () => {
          if (!acting) return;
          const note = reason.trim();
          await resolve({ reportId: acting.report.id, action: acting.action, ...(note ? { reason: note } : {}) });
          setGone(current => [...current, acting.report.id]);
          setMessage(DONE[acting.action]);
          // The report's buttons are gone with its row: once the dialog has closed, focus goes to the result.
          window.setTimeout(() => result.current?.focus(), 250);
        }}
      >
        <div>
          <label htmlFor={reasonId} className={cx(eyebrowClassName, 'mb-2')}>Reason (optional)</label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={event => setReason(event.target.value)}
            maxLength={REASON_LIMIT}
            rows={2}
            aria-describedby={`${reasonId}-count`}
            placeholder="Kept with the report"
            className="w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
          <p id={`${reasonId}-count`} className="mt-1 text-right text-xs tabular-nums text-stone-500 dark:text-stone-400">{left} character{left === 1 ? '' : 's'} left</p>
        </div>
      </ConfirmDialog>
    </PageContainer>
  );
}

export default function ModerationPage() {
  const me = useQuery(api.community.me, {});
  if (me === undefined) return <PageLoader rows={3} />;
  return me.me?.moderator ? <Queue /> : <NotAvailable />;
}
