import { afterEach, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { KitchenDatabase } from '../../src/server/kitchen/database';
import { authenticate, createResetCode, digest, session } from '../../src/server/kitchen/authentication';
import { readNewPassword } from '../../scripts/password-prompt.mjs';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(run => run()); });
const memory = () => { const db = new KitchenDatabase(':memory:'); cleanup.push(() => db.close()); return db; };

test('reset codes are stored hashed, replace older codes, and look the same for unknown emails', async () => {
  const db = memory();
  await authenticate({flow:'signUp', email:'cook@example.com', password:'Password123!', name:'Cook'}, db);
  const first = await createResetCode('cook@example.com', db);
  const second = await createResetCode('cook@example.com', db);
  expect(second).toMatch(/^[\w-]{43}$/);
  const rows = db.sql.prepare('SELECT token_hash FROM reset_tokens').all();
  expect(rows).toEqual([{token_hash: digest(second!)}]);
  expect(rows[0].token_hash).not.toBe(digest(first!));
  expect(await createResetCode('nobody@example.com', db)).toBeNull();
});

test('a reset code changes the password once, signs everyone out, and fails the same way for every bad link', async () => {
  const db = memory();
  const cook = await authenticate({flow:'signUp', email:'cook@example.com', password:'OldPassword1!', name:'Cook'}, db);
  await authenticate({flow:'signUp', email:'other@example.com', password:'OtherPassword1!', name:'Other'}, db);
  const verify = (email: string, code: string | null, newPassword = 'NewPassword1!') => authenticate({flow:'reset-verification', email, code, newPassword}, db);
  const bad = 'Invalid or expired reset link';

  const otherCode = await createResetCode('other@example.com', db);
  const stale = await createResetCode('cook@example.com', db);
  const code = await createResetCode('cook@example.com', db);
  await expect(verify('cook@example.com', stale)).rejects.toThrow(bad);
  await expect(verify('cook@example.com', otherCode)).rejects.toThrow(bad);
  await expect(verify('nobody@example.com', code)).rejects.toThrow(bad);

  await expect(verify('cook@example.com', code, 'short')).rejects.toThrow('Password must be 8–128 characters');
  const reset = await verify('cook@example.com', code);
  expect(reset.token).toBeTruthy();
  expect(await session(cook.token, db)).toBeNull();
  await expect(verify('cook@example.com', code, 'Another1!')).rejects.toThrow(bad);
  await expect(authenticate({flow:'signIn', email:'cook@example.com', password:'OldPassword1!'}, db)).rejects.toThrow('Invalid email or password');
  expect((await authenticate({flow:'signIn', email:'cook@example.com', password:'NewPassword1!'}, db)).token).toBeTruthy();

  const expired = await createResetCode('cook@example.com', db);
  db.sql.prepare('UPDATE reset_tokens SET expires=?').run(Date.now() - 1);
  await expect(verify('cook@example.com', expired)).rejects.toThrow(bad);
});

test('reset requests are limited per email and across the whole kitchen', async () => {
  const db = memory();
  for (let i = 0; i < 5; i++) await createResetCode('same@example.com', db);
  await expect(createResetCode('same@example.com', db)).rejects.toThrow('Too many attempts');
  // The refused request above rolled back, so 5 + 45 reaches the limit of 50.
  for (let i = 0; i < 45; i++) await createResetCode(`person${i}@example.com`, db);
  await expect(createResetCode('fresh@example.com', db)).rejects.toThrow('Too many attempts');
});

test('piped passwords keep multi-byte characters split across chunks and drop the trailing newline', async () => {
  const bytes = Buffer.from('pässwörd-🔑\n');
  const chunks = [bytes.subarray(0, 2), bytes.subarray(2, 13), bytes.subarray(13)];
  expect(await readNewPassword(Readable.from(chunks))).toBe('pässwörd-🔑');
  await expect(readNewPassword(Readable.from([Buffer.alloc(1025, 'a')]))).rejects.toThrow('Password too long');
  await expect(readNewPassword(Readable.from(['Password1!\nPassword1!\n']))).rejects.toThrow('single line');
});

test('the terminal prompt hides typing and asks for the password twice', async () => {
  const terminal = () => {
    const input = Object.assign(new PassThrough(), {isTTY: true, setRawMode: () => input});
    const output = new PassThrough();
    let shown = '';
    output.on('data', chunk => { shown += chunk; });
    return {input, output, shown: () => shown};
  };
  const type = (input: PassThrough, lines: string[]) => lines.forEach((line, i) => setTimeout(() => input.write(`${line}\r`), 10 * (i + 1)));

  const match = terminal();
  type(match.input, ['Secret-pass1', 'Secret-pass1']);
  expect(await readNewPassword(match.input, match.output)).toBe('Secret-pass1');
  expect(match.shown()).toContain('Confirm new password');
  expect(match.shown()).not.toContain('Secret');

  const mismatch = terminal();
  type(mismatch.input, ['Secret-pass1', 'Secret-pass2']);
  await expect(readNewPassword(mismatch.input, mismatch.output)).rejects.toThrow('Passwords do not match');
});

test('the reset-password command replaces the password and signs everyone out', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sous-chef-reset-'));
  cleanup.push(() => rmSync(dir, {recursive:true, force:true}));
  const db = new KitchenDatabase(join(dir, 'kitchen.sqlite'));
  const signedUp = await authenticate({flow:'signUp', email:'cook@example.com', password:'OldPassword1!', name:'Cook'}, db);
  await createResetCode('cook@example.com', db);
  db.close();

  const script = resolve('scripts/local-admin.mjs');
  const run = (email: string, input: string) => spawnSync(process.execPath, [script, 'reset-password', email], {cwd:dir, input, encoding:'utf8', env:{...process.env, SOUS_CHEF_DATA_DIR:dir, NODE_NO_WARNINGS:'1'}});

  const missing = run('nobody@example.com', 'NewPassword1!\n');
  expect(missing.status).toBe(1);
  expect(missing.stderr.trim()).toBe('No account uses nobody@example.com. Nothing was changed.');

  const short = run('cook@example.com', 'short\n');
  expect(short.status).toBe(1);
  expect(short.stderr).not.toMatch(/\n\s+at /);

  const reset = run('Cook@Example.com', 'NewPassword1!\n');
  expect(reset.status, reset.stderr).toBe(0);

  const after = new KitchenDatabase(join(dir, 'kitchen.sqlite'));
  cleanup.unshift(() => after.close());
  expect(await session(signedUp.token, after)).toBeNull();
  expect(after.sql.prepare('SELECT COUNT(*) n FROM reset_tokens').get()?.n).toBe(0);
  await expect(authenticate({flow:'signIn', email:'cook@example.com', password:'OldPassword1!'}, after)).rejects.toThrow('Invalid');
  expect((await authenticate({flow:'signIn', email:'cook@example.com', password:'NewPassword1!'}, after)).token).toBeTruthy();
});
