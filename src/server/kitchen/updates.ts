import { mkdir, readFile, open, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fetchRelease, isNewer } from '../../../scripts/update/releases.mjs';
import packageInfo from '../../../package.json';

export const installedVersion = packageInfo.version;
export const buildRevision = process.env.SOUS_CHEF_BUILD_REVISION || 'local';
type Release = Awaited<ReturnType<typeof fetchRelease>>;
let cache: { release: Release; checkedAt: string; error: string | null; expires: number } | undefined;
let pending: Promise<void> | undefined;
export async function releaseStatus(force = false) {
  if (!cache || cache.expires < Date.now() || (force && Date.parse(cache.checkedAt) < Date.now() - 60000)) {
    pending ??= (async () => {
      try {
        cache = { release: await fetchRelease(undefined), checkedAt: new Date().toISOString(), error: null, expires: Date.now() + 6 * 3600000 };
      } catch {
        cache = { release: cache?.release ?? null, checkedAt: new Date().toISOString(), error: 'Couldn’t check for updates. Your kitchen still works normally.', expires: Date.now() + 5 * 60000 };
      }
    })().finally(() => { pending = undefined; });
    await pending;
  }
  return {
    installedVersion, buildRevision,
    latest: cache!.release ? { version: cache!.release.version, url: cache!.release.url, notes: cache!.release.notes } : null,
    available: !!cache!.release && isNewer(cache!.release.version, installedVersion),
    checkedAt: cache!.checkedAt, error: cache!.error,
  };
}
export async function updaterStatus() {
  const directory = process.env.SOUS_CHEF_UPDATE_DIR;
  if (!directory || process.env.SOUS_CHEF_DEMO === 'true') return { managed: false, job: null };
  try {
    const heartbeat = await stat(join(directory, 'heartbeat'));
    const job = JSON.parse(await readFile(join(directory, 'status.json'), 'utf8'));
    return { managed: Date.now() - heartbeat.mtimeMs < 20000, job };
  } catch { return { managed: false, job: null }; }
}
export async function requestUpdate(version: string) {
  const status = await releaseStatus(true);
  if (status.error || !status.available || status.latest?.version !== version) throw new Error('Check for updates again before installing.');
  const updater = await updaterStatus();
  if (!updater.managed) throw new Error('The updater is not connected. Follow the installation instructions.');
  if (updater.job && !['idle', 'complete', 'failed'].includes(updater.job.phase)) throw new Error('An update is already running.');
  const directory = process.env.SOUS_CHEF_UPDATE_DIR!;
  await mkdir(directory, { recursive: true });
  // Exclusive creation prevents two admins from queuing competing requests.
  const id = randomUUID();
  const file = join(directory, 'request.json');
  const handle = await open(file, 'wx', 0o660).catch(() => { throw new Error('An update is already queued.'); });
  try { await handle.chmod(0o660); await handle.writeFile(JSON.stringify({ id, version })); await handle.sync(); }
  catch (error) { await unlink(file); throw error; }
  finally { await handle.close(); }
  return id;
}
