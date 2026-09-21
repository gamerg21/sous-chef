#!/usr/bin/env node
// A separate host process: never execute update commands inside the web server.
import { mkdir, readFile, unlink, stat, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchRelease, isNewer, parseVersion } from './update/releases.mjs';
import { publish, readRequest } from './update/ipc.mjs';
import { dockerAdapter, portableAdapter } from './update/adapters.mjs';
const { values } = parseArgs({ options: { docker: { type: 'string' }, portable: { type: 'string' }, state: { type: 'string' }, url: { type: 'string' } } });
if (!!values.docker === !!values.portable || !values.state) throw new Error('Usage: node scripts/updater.mjs --docker CONTAINER | --portable DIRECTORY --state DIRECTORY [--url http://127.0.0.1:3000]');
process.umask(0o077);
const state = resolve(values.state);
const url = values.url || `http://127.0.0.1:${process.env.PORT || 3000}`;
await mkdir(state, { recursive: true, mode: 0o700 });
const ipc = join(state, 'ipc');
await mkdir(ipc, { recursive: true, mode: 0o700 });
// The operator gives the app access to this one IPC directory (see docs/UPDATES.md).
const lock = await open(join(state, 'service.lock'), 'wx', 0o600).catch(() => { throw new Error('Updater already running, or a stale service.lock needs operator recovery.'); });
await lock.writeFile(String(process.pid)); await lock.close();
let job = { phase: 'idle', message: 'Ready for updates.' };
try {
  const saved = JSON.parse(await readFile(join(state, 'status.json'), 'utf8'));
  job = ['idle', 'complete', 'failed', 'recovery-required'].includes(saved.phase) ? saved : { ...saved, phase: 'recovery-required', message: 'The updater was interrupted. Inspect the retained backup and app before trying again.' };
} catch { /* First start. */ }
async function report(phase, message) {
  job = { ...job, phase, message, updatedAt: new Date().toISOString() };
  await publish(state, 'status.json', JSON.stringify(job), 0o600);
  await publish(ipc, 'status.json', JSON.stringify(job));
}
let adapter, active = false, closing = false;
async function shutdown() {
  if (closing) return; closing = true;
  if (active) { console.error('An update is running. Wait for it to finish before stopping the updater.'); closing = false; return; }
  await adapter?.stop?.();
  await unlink(join(ipc, 'heartbeat')).catch(() => {});
  await unlink(join(state, 'service.lock')).catch(() => {});
  process.exit();
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
try {
  adapter = values.docker ? await dockerAdapter(values.docker, state, url) : await portableAdapter(resolve(values.portable), state, url);
  await report(job.phase, job.message);
  const heartbeat = setInterval(() => { void publish(ipc, 'heartbeat', '').catch(() => {}); }, 3000);
  heartbeat.unref();
  await publish(ipc, 'heartbeat', '');
  // Read requests only from the configured IPC directory. The only input is a stable version.
  while (!closing) {
    if (job.phase === 'recovery-required') { await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
    const path = join(ipc, 'request.json');
    try {
      const metadata = await stat(path);
      if (metadata.size > 1024) throw new Error('Invalid update request');
      if (Date.now() - metadata.mtimeMs < 500) { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
      const request = await readRequest(path);
      if (!parseVersion(request.version) || !/^[a-f0-9-]{36}$/.test(request.id)) throw new Error('Invalid update request');
      active = true; job = { id: request.id, version: request.version, phase: 'checking', message: 'Verifying the release…' };
      await report(job.phase, job.message);
      const current = await fetch(new URL('/api/version', url), { signal: AbortSignal.timeout(5000) }).then(r => r.json());
      if (!isNewer(request.version, current.version)) throw new Error('The requested release is not newer than the installed version.');
      const release = await fetchRelease(request.version);
      await adapter.install(release, report);
    } catch (error) {
      if (error.code !== 'ENOENT') await report(error.recoveryRequired ? 'recovery-required' : 'failed', error.code ? 'Updater storage is unavailable. Inspect the updater host.' : error.message || 'Update failed. Inspect the updater host.');
    } finally {
      if (active) { await unlink(path).catch(() => {}); active = false; }
    }
    // Remove malformed requests too; they must never execute or block subsequent requests.
    if (job.phase === 'failed') await unlink(path).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} catch (error) {
  await unlink(join(ipc, 'heartbeat')).catch(() => {});
  await unlink(join(state, 'service.lock')).catch(() => {});
  throw error;
}
