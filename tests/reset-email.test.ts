import { expect, test } from 'vitest';
import { resetEmailConfiguration } from '../src/server/kitchen/reset-email';

test('email recovery requires all settings rather than advertising unsendable links', () => {
  const configured = {RESEND_API_KEY:'re_test', SMTP_FROM:'Kitchen <kitchen@example.com>', APP_URL:'https://kitchen.example.com'};
  expect(resetEmailConfiguration(configured)?.origin).toBe(configured.APP_URL);
  for (const name of Object.keys(configured)) {
    expect(resetEmailConfiguration({...configured, [name]:''})).toBeNull();
  }
  for (const APP_URL of ['not a URL', 'file:///tmp/kitchen', 'https://user:password@example.com']) {
    expect(resetEmailConfiguration({...configured, APP_URL})).toBeNull();
  }
  expect(resetEmailConfiguration({...configured,APP_URL:'http://192.168.1.20:3000'})).not.toBeNull();
});
