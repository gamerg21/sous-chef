import { afterEach, expect, test, vi } from 'vitest';
import type { GenericActionCtx } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { sendPasswordResetEmail } from './auth';

const ctx = { runMutation: async () => ({ allowed: true }) } as unknown as GenericActionCtx<DataModel>;
const request = { identifier: 'cook@example.com', url: 'https://community.example/reset?code=SECRET_RESET_CODE', expires: new Date(Date.now() + 3_600_000) };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function captureLogs() {
  const lines: string[] = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')); });
  }
  return lines;
}

test('without email delivery, password reset fails closed and logs no credentials', async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  const lines = captureLogs();
  await expect(sendPasswordResetEmail(request, ctx)).rejects.toThrow('Contact the community operator');
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line).not.toContain('SECRET_RESET_CODE');
    expect(line).not.toContain(request.url);
    expect(line).not.toContain(request.identifier);
  }
});

test('with email delivery, the link goes only to the email provider', async () => {
  vi.stubEnv('RESEND_API_KEY', 're_test_dummy');
  const lines = captureLogs();
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await sendPasswordResetEmail(request, ctx);
  expect(fetch).toHaveBeenCalledOnce();
  expect(String(fetch.mock.calls[0][1].body)).toContain('SECRET_RESET_CODE');
  expect(lines.join('\n')).not.toContain('SECRET_RESET_CODE');
});
