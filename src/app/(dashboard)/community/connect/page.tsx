'use client';
import { useState } from 'react';
import { useAction, useMutation, useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api as communityApi } from '../../../../../convex/_generated/api';
import { api } from '@/lib/kitchen/api';
import { request } from '@/lib/kitchen/client';
import Link from 'next/link';
import { ArrowLeft, Link2, LogOut, ShieldOff } from 'lucide-react';
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
  rowsClassName,
  Section,
  SegmentedControl,
} from '@/components/ui/kit';

type Flow = 'signIn' | 'signUp';

const fieldRow = 'block px-4 py-3';

function ConnectForm() {
  const { isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const issueToken = useAction(communityApi.hub.issueToken);
  const revoke = useMutation(communityApi.hub.revokeTokens);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [flow, setFlow] = useState<Flow>('signIn');
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
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
                  <p className="text-xs text-stone-500 dark:text-stone-400">Issues a publishing token for this kitchen only.</p>
                </div>
                <button
                  disabled={busy}
                  className={buttonClassName('primary')}
                  onClick={() =>
                    void run(async () => {
                      const token = await issueToken({});
                      await request(api.community.setConnection, { token });
                    }, 'Connected. You can publish recipes from your library.')
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
        description="Your community account is separate from your private kitchen. Only recipes you choose to publish are uploaded."
      />
      <CommunityAccountProvider>
        <ConnectForm />
      </CommunityAccountProvider>
    </PageContainer>
  );
}
