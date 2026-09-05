import { describe, expect, test, afterEach, vi } from 'vitest';
import { getPublicRuntimeConfig } from '../src/lib/runtime-config';
import { getAppBaseUrl, resolveAllowedRedirectUrl } from '../src/lib/app-url';

afterEach(() => vi.unstubAllEnvs());

describe('portable instance configuration', () => {
  test('accepts cloud and self-hosted origins without exposing server secrets', () => {
    expect(getPublicRuntimeConfig({ CONVEX_URL: 'http://kitchen.local:3210/', NEXT_PUBLIC_CONVEX_URL: 'https://old.convex.cloud', JWT_PRIVATE_KEY: 'secret' })).toEqual({ convexUrl: 'http://kitchen.local:3210' });
    expect(getPublicRuntimeConfig({ NEXT_PUBLIC_CONVEX_URL: 'https://kitchen.convex.cloud' })).toEqual({ convexUrl: 'https://kitchen.convex.cloud' });
  });
  test.each(['', 'not a url', 'https://your-deployment.convex.cloud', 'javascript:alert(1)', 'https://user:secret@host.test', 'https://host.test/?token=secret', 'https://host.test/api'])('shows setup for invalid URL %s', value => {
    expect(getPublicRuntimeConfig({ CONVEX_URL: value })).toEqual({ convexUrl: null });
  });
  test('fresh Convex Auth setup can generate reset links using SITE_URL', () => {
    vi.stubEnv('APP_BASE_URL', '');
    vi.stubEnv('SITE_URL', 'http://localhost:3100/');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getAppBaseUrl()).toBe('http://localhost:3100');
    expect(resolveAllowedRedirectUrl('/auth/reset-password?email=test%40example.com')).toBe('http://localhost:3100/auth/reset-password?email=test%40example.com');
    expect(() => resolveAllowedRedirectUrl('http://localhost:3100.evil.test')).toThrow();
  });
});
