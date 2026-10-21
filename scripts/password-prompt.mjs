import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

// readline still handles editing and raw mode, but never echoes the password.
export async function readNewPassword(input = process.stdin, output = process.stdout) {
  if (!input.isTTY) {
    let value = '';
    for await (const chunk of input) {
      value += chunk;
      if (value.length > 256) throw new Error('Password too long');
    }
    return value.replace(/[\r\n]+$/, '');
  }
  const hidden = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const rl = createInterface({ input, output: hidden, terminal: true });
  const controller = new AbortController();
  rl.on('SIGINT', () => controller.abort());
  rl.on('close', () => controller.abort());
  try {
    output.write('New password (8–128 characters; typing is hidden): ');
    const password = await rl.question('', { signal: controller.signal });
    output.write('\nConfirm new password: ');
    const confirmation = await rl.question('', { signal: controller.signal });
    if (password !== confirmation) throw new Error('Passwords do not match. Nothing was changed.');
    return password;
  } finally {
    rl.close();
    output.write('\n');
  }
}
