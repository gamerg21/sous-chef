'use client';
import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAction, useMutation, useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api as communityApi } from '../../../../../convex/_generated/api';
import { api } from '@/lib/kitchen/api';
import { request, useMutation as useKitchenMutation, useQuery as useKitchenQuery } from '@/lib/kitchen/client';
import { COMMUNITY_LIMITS, type Me } from '@/lib/community-contract';
import { errorMessage, remaining } from '@/components/community/safety/logic';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, EyeOff, Link2, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { CommunityAccountProvider } from '@/components/community/CommunityAccountProvider';
import {
  bareInputClassName,
  buttonClassName,
  cardClassName,
  cx,
  eyebrowClassName,
  IconBadge,
  PageContainer,
  PageHeader,
  Pill,
  rowsClassName,
  Section,
  SegmentedControl,
} from '@/components/ui/kit';

type Flow = 'signIn' | 'signUp';

const fieldRow = 'block px-4 py-3';
const rowLink =
  'flex min-h-14 items-center gap-3 px-4 py-3 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-800/40';
const countOf = (count: number, singular: string, plural = `${singular}s`) => `${count.toLocaleString('en')} ${count === 1 ? singular : plural}`;

/** The connected community profile, with its name and bio editable in place. */
function ProfileForm({ me }: { me: Me }) {
  const bioId = useId();
  const update = useKitchenMutation(api.community.updateProfile);
  const running = useRef(false);
  const [draft, setDraft] = useState<{ name: string; bio: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const name = draft?.name ?? me.name;
  const bio = draft?.bio ?? me.bio ?? '';
  const changed = name.trim() !== me.name || bio.trim() !== (me.bio ?? '');
  const left = remaining(bio, COMMUNITY_LIMITS.bio);
  const edit = (next: Partial<{ name: string; bio: string }>) => {
    setDraft({ name, bio, ...next });
    setSaved('');
  };
  const save = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setSaved('');
    setError('');
    try {
      await update({ name: name.trim(), bio: bio.trim() });
      setDraft(null);
      setSaved('Profile saved.');
    } catch (failure) {
      setError(errorMessage(failure, 'Your profile couldn’t be saved. Try again.'));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Section title="Your community profile" aside={me.moderator ? <Pill tone="info">Moderator</Pill> : undefined}>
        <div className={cx(cardClassName, rowsClassName)}>
          <label className={fieldRow}>
            <span className={eyebrowClassName}>Display name</span>
            <input value={name} onChange={(e) => edit({ name: e.target.value })} required maxLength={COMMUNITY_LIMITS.name} autoComplete="nickname" disabled={busy} className={cx(bareInputClassName, 'mt-1 min-h-8')} placeholder="How other cooks see you" />
          </label>
          <div className={fieldRow}>
            <label htmlFor={bioId} className={eyebrowClassName}>Bio</label>
            <textarea id={bioId} value={bio} onChange={(e) => edit({ bio: e.target.value })} maxLength={COMMUNITY_LIMITS.bio} rows={2} disabled={busy} aria-describedby={`${bioId}-count`} className={cx(bareInputClassName, 'mt-1 block resize-y')} placeholder="A line about what you cook (optional)" />
            <p id={`${bioId}-count`} className={cx('mt-1 text-right text-xs tabular-nums', left <= 10 ? 'text-amber-700 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400')}>{left} character{left === 1 ? '' : 's'} left</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm text-stone-600 dark:text-stone-400">
              {countOf(me.recipeCount, 'recipe')} · {countOf(me.followerCount, 'follower')} · {me.followingCount.toLocaleString('en')} following
            </p>
            <button disabled={busy || !changed} aria-busy={busy} className={cx(buttonClassName('primary'), 'min-h-11')}>{busy ? 'Saving…' : 'Save profile'}</button>
          </div>
        </div>
        <p role="alert" className={cx('mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100', !error && 'hidden')}>{error}</p>
        <p role="status" className={cx('mt-3 text-sm text-emerald-800 dark:text-emerald-300', !saved && 'hidden')}>{saved}</p>
      </Section>
    </form>
  );
}

/** What this kitchen's stored community connection gives: the profile, and the safety pages. */
function CommunityProfile() {
  const state = useKitchenQuery(api.community.me, {});
  if (!state) return null;
  return (
    <>
      {state.connected && state.me && <ProfileForm me={state.me} />}
      {state.connected && !state.me && (
        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          This kitchen is connected, but your community profile couldn’t be loaded. The community may be unreachable, or the connection has expired: sign in below and connect this kitchen again.
        </p>
      )}
      <Section title="Safety">
        <div className={cx(cardClassName, rowsClassName)}>
          <Link className={rowLink} href="/community/hidden">
            <IconBadge icon={EyeOff} tone="neutral" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">Hidden &amp; blocked</span>
              <span className="block text-xs text-stone-600 dark:text-stone-400">Recipes you hid or reported and cooks you blocked.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
          </Link>
          {state.me?.moderator && (
            <Link className={rowLink} href="/community/moderation">
              <IconBadge icon={ShieldCheck} tone="info" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">Moderation queue</span>
                <span className="block text-xs text-stone-600 dark:text-stone-400">Review reports from the community.</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          )}
        </div>
      </Section>
    </>
  );
}

function ConnectForm() {
  const { isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const issueToken = useAction(communityApi.hub.issueToken);
  const revoke = useMutation(communityApi.hub.revokeTokens);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<Flow>('signIn');
  const kitchenQueries = useQueryClient();
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
      // The stored connection may have changed: reload the profile it gives.
      void kitchenQueries.invalidateQueries({ queryKey: ['kitchen'] });
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {!isAuthenticated ? (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void run(() => signIn('password', data), 'Signed in. You can now connect this kitchen.');
          }}
        >
          <Section title="Community account" aside={<SegmentedControl label="Account" value={flow} onChange={setFlow} options={[{ value: 'signIn', label: 'Sign in' }, { value: 'signUp', label: 'Create account' }]} />}>
            <input type="hidden" name="flow" value={flow} />
            <div className={cx(cardClassName, rowsClassName)}>
              <label className={fieldRow}>
                <span className={eyebrowClassName}>Display name</span>
                <input name="name" autoComplete="name" className={cx(bareInputClassName, 'mt-1 min-h-8')} placeholder="How other cooks see you" />
              </label>
              <label className={fieldRow}>
                <span className={eyebrowClassName}>Community email</span>
                <input name="email" type="email" autoComplete="email" required className={cx(bareInputClassName, 'mt-1 min-h-8')} placeholder="you@example.com" />
              </label>
              <label className={fieldRow}>
                <span className={eyebrowClassName}>Community password</span>
                <input name="password" type="password" autoComplete="current-password" required minLength={8} className={cx(bareInputClassName, 'mt-1 min-h-8')} placeholder="At least 8 characters" />
              </label>
            </div>
          </Section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link className="inline-flex min-h-11 items-center text-sm text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100" href="/community-account/recovery">
              Forgot your community password?
            </Link>
            <button disabled={busy} className={cx(buttonClassName('primary'), 'min-h-11 px-6')}>
              Continue
            </button>
          </div>
        </form>
      ) : (
        <>
          <Section title="This kitchen">
            <div className={cx(cardClassName, rowsClassName)}>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <IconBadge icon={Link2} tone="success" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Publish from your library</div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Issues a token for this kitchen only. It publishes, likes, rates and follows as you.</p>
                </div>
                <button
                  disabled={busy}
                  className={buttonClassName('primary')}
                  onClick={() =>
                    void run(async () => {
                      const token = await issueToken({});
                      await request(api.community.setConnection, { token });
                    }, 'Connected. You can publish recipes, like, rate and follow cooks from this kitchen.')
                  }
                >
                  Connect this kitchen
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <IconBadge icon={LogOut} tone="neutral" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Community session</div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Signs this browser out. Published recipes stay online.</p>
                </div>
                <button disabled={busy} className={buttonClassName('secondary')} onClick={() => void run(() => signOut(), 'Signed out of the community account.')}>
                  Sign out of community
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 p-4">
                <IconBadge icon={ShieldOff} tone="danger" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100">Publishing connections</div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Revokes every kitchen’s ability to publish as you.</p>
                </div>
                <button
                  disabled={busy}
                  className={cx(buttonClassName('secondary'), 'text-rose-700 dark:text-rose-300')}
                  onClick={() =>
                    void run(async () => {
                      await revoke({});
                      await request(api.community.setConnection, { token: '' });
                    }, 'All community publishing connections revoked.')
                  }
                >
                  Revoke all connections
                </button>
              </div>
            </div>
          </Section>
          <Link className="inline-flex min-h-11 items-center text-sm text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100" href="/community-account/recovery">
            Forgot your community password?
          </Link>
        </>
      )}
      <p role="status" className={cx('text-sm text-stone-700 dark:text-stone-300', message && 'rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/40')}>
        {message}
      </p>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <PageContainer width="3xl">
      <PageHeader
        back={
          <Link
            className="-ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            href="/community"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Back to community
          </Link>
        }
        eyebrow="Recipe community"
        title="Connect to the recipe community"
        description="Your community account is separate from your private kitchen. Only recipes you choose to publish are uploaded; likes, ratings, tips and follows are public under your display name."
      />
      <CommunityProfile />
      <CommunityAccountProvider>
        <ConnectForm />
      </CommunityAccountProvider>
    </PageContainer>
  );
}
