import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

// readline still handles editing and raw mode, but never echoes the password.
/**
 * @param {NodeJS.ReadableStream & {isTTY?: boolean}} [input]
 * @param {NodeJS.WritableStream} [output]
 * @returns {Promise<string>}
 */
export async function readNewPassword(input = process.stdin, output = process.stdout) {
  if (!input.isTTY) {
    // Decode once at the end so a UTF-8 character split across chunks stays intact.
    const chunks = [];
    let size = 0;
    for await (const chunk of input) {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += bytes.length;
      if (size > 1024) throw new Error('Password too long');
      chunks.push(bytes);
    }
    const value = Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
    if (value.length > 256) throw new Error('Password too long');
    // Two piped lines would save a password nobody can type into the sign-in form.
    if (/[\r\n]/.test(value)) throw new Error('Pipe the new password as a single line. Nothing was changed.');
    return value;
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
