import { expect, test } from 'vitest';
import type { Report } from '../src/lib/community-contract';
import { NOT_CONNECTED, RECONNECT, TRY_LATER, UNREACHABLE } from '../src/server/kitchen/communityRemote';
import { ageLabel, banTarget, errorMessage, failureKind, modActionsFor, modConfirmation, remaining } from '../src/components/community/safety/logic';

const report = (overrides: Partial<Report> = {}): Report => ({
  id: 'rep1', status: 'open', createdAt: '2026-11-10T10:00:00.000Z', reason: 'spam', reportCount: 1,
  recipe: { id: 'r1', title: 'Tomato pasta', author: { id: 'cook-1', name: 'Ada' }, visibility: 'public', underReview: false }, ...overrides,
});
const tip = { id: 't1', author: { id: 'cook-2', name: 'Bo' }, rating: 5, tip: 'Buy my pills' };

test('recognizes the local server’s community failures', () => {
  expect(failureKind(NOT_CONNECTED)).toBe('connect');
  expect(failureKind(RECONNECT)).toBe('reconnect');
  expect(failureKind(TRY_LATER)).toBe('busy');
  expect(failureKind(UNREACHABLE)).toBe('unreachable');
  expect(failureKind("Your community account isn't allowed to do this")).toBe('forbidden');
  expect(failureKind("This text isn't allowed in the community")).toBe('other');
});
test('gives a message for any thrown value', () => {
  expect(errorMessage(new Error(' Nope '))).toBe('Nope');
  expect(errorMessage('text', 'Fallback')).toBe('Fallback');
  expect(errorMessage(new Error('x'.repeat(400)))).toHaveLength(300);
  expect(remaining('abc', 10)).toBe(7);
});
test('describes how old a report is', () => {
  const now = Date.parse('2026-11-10T12:00:00.000Z');
  expect(ageLabel('2026-11-10T11:59:40.000Z', now)).toBe('just now');
  expect(ageLabel('2026-11-10T11:15:00.000Z', now)).toBe('45 min ago');
  expect(ageLabel('2026-11-10T07:00:00.000Z', now)).toBe('5 hr ago');
  expect(ageLabel('2026-11-09T07:00:00.000Z', now)).toBe('1 day ago');
  expect(ageLabel('2026-11-01T07:00:00.000Z', now)).toBe('9 days ago');
  expect(ageLabel('2026-11-10T13:00:00.000Z', now)).toBe('just now');
  expect(ageLabel('2026-01-05T12:00:00.000Z', now)).toMatch(/2026/);
  expect(ageLabel('nonsense', now)).toBe('');
});
test('offers only the actions that apply', () => {
  expect(modActionsFor(report())).toEqual(['dismiss', 'remove_recipe', 'ban_user']);
  expect(modActionsFor(report({ tip }))).toEqual(['dismiss', 'remove_tip', 'remove_recipe', 'ban_user']);
  expect(modActionsFor(report({ recipe: null }))).toEqual(['dismiss']);
  expect(modActionsFor(report({ recipe: null, tip }))).toEqual(['dismiss', 'remove_tip', 'ban_user']);
  expect(modActionsFor(report({ status: 'actioned' }))).toEqual([]);
  expect(banTarget(report())?.name).toBe('Ada');
  expect(banTarget(report({ tip }))?.name).toBe('Bo');
});
test('confirmations say exactly what happens', () => {
  expect(modConfirmation(report(), 'dismiss')).toEqual({ title: 'Dismiss report?', message: 'Nothing is removed. The recipe stays published. The report is closed.', confirmText: 'Dismiss report', danger: false });
  expect(modConfirmation(report({ reportCount: 3, recipe: { ...report().recipe!, underReview: true } }), 'dismiss').message).toBe('Nothing is removed. The recipe stays published and comes back out of review. All 3 open reports on it are closed.');
  expect(modConfirmation(report({ tip }), 'dismiss').message).toBe('Nothing is removed. The tip stays visible. The report is closed.');
  expect(modConfirmation(report({ tip }), 'remove_tip')).toMatchObject({ title: 'Remove tip?', message: 'The tip by Bo is removed for everyone. The recipe stays published.', danger: true });
  expect(modConfirmation(report(), 'remove_recipe').message).toBe('“Tomato pasta” by Ada is hidden for everyone, for good. Its cook can’t republish it.');
  expect(modConfirmation(report(), 'ban_user')).toMatchObject({ title: 'Ban Ada?', confirmText: 'Ban cook', danger: true });
  expect(modConfirmation(report(), 'ban_user').message).toContain('all their recipes are removed, they can’t publish, and they can’t sign in again');
  expect(modConfirmation(report({ tip }), 'ban_user').title).toBe('Ban Bo?');
});
