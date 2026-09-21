import { open, rename, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// The app can write in IPC. Never follow an app-created link as the host updater.
export async function publish(directory, name, value, mode = 0o644) {
  const temporary = join(directory, `.updater-${randomUUID()}`);
  const handle = await open(temporary, 'wx', mode);
  try {
    await handle.chmod(mode);
    await handle.writeFile(value);
    await handle.sync();
  } finally { await handle.close(); }
  try { await rename(temporary, join(directory, name)); }
  finally { await unlink(temporary).catch(() => {}); }
}
export async function readRequest(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > 1024) throw new Error('Invalid update request');
    // One bounded read prevents a concurrent writer from growing memory use.
    const buffer = Buffer.alloc(1025);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 1024) throw new Error('Invalid update request');
    try { return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')); }
    catch { throw new Error('Invalid update request'); }
  } finally { await handle.close(); }
}
