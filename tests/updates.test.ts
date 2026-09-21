import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchRelease, isNewer, portableAsset, RELEASES_URL } from '../scripts/update/releases.mjs';
import { replacementConfig } from '../scripts/update/adapters.mjs';

const release = { tag_name: 'v0.9.0', draft: false, prerelease: false, body: 'New kitchen features', assets: [] };
let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'sous-chef-updates-test-')); });
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); await rm(directory, { recursive: true, force: true }); });

test('compares numeric stable semver and rejects prereleases, invalid and unsafe versions', () => {
  expect(isNewer('0.10.0', '0.9.9')).toBe(true);
  expect(isNewer('1.0.0', '0.99.99')).toBe(true);
  for (const next of ['0.8.0', '0.7.9', '0.9.0-beta.1', 'latest', '0.09.0', '0.9.0;rm', '999999999999999999999.0.0']) expect(isNewer(next, '0.8.0')).toBe(false);
});
test('trusts only stable releases and generates its own official release URL', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ ...release, html_url: 'https://evil.example' }));
  expect(await fetchRelease(undefined, fetcher)).toMatchObject({ version: '0.9.0', url: `${RELEASES_URL}/tag/v0.9.0` });
  expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/repos/gamerg21/sous-chef/releases/latest');
  for (const override of [{ draft: true }, { prerelease: true }, { tag_name: 'v0.9.0-beta.1' }]) {
    await expect(fetchRelease(undefined, vi.fn().mockResolvedValue(Response.json({ ...release, ...override })))).rejects.toThrow('Invalid stable release');
  }
  await expect(fetchRelease('0.10.0', fetcher)).rejects.toThrow('Invalid stable release');
});
test('distinguishes no published release from unavailable GitHub', async () => {
  expect(await fetchRelease(undefined, vi.fn().mockResolvedValue(new Response('', { status: 404 })))).toBeNull();
  await expect(fetchRelease(undefined, vi.fn().mockResolvedValue(new Response('', { status: 403 })))).rejects.toThrow('unavailable');
});
test('portable packages must match platform, official URL and a GitHub SHA-256 digest', () => {
  const asset = { name: 'sous-chef-linux-arm64.tar.gz', browser_download_url: `${RELEASES_URL}/download/v0.9.0/sous-chef-linux-arm64.tar.gz`, digest: `sha256:${'a'.repeat(64)}` };
  expect(portableAsset({ version: '0.9.0', assets: [asset] }, 'linux', 'arm64').sha256).toHaveLength(64);
  for (const bad of [{ ...asset, digest: null }, { ...asset, browser_download_url: 'https://evil.example/file' }]) expect(() => portableAsset({ version: '0.9.0', assets: [bad] }, 'linux', 'arm64')).toThrow('verified portable');
  expect(() => portableAsset({ version: '0.9.0', assets: [asset] }, 'linux', 'x64')).toThrow();
});
test('Docker recreation preserves environment, mounts, ports and network aliases; rejects static IP', () => {
  const container = { Id: 'a'.repeat(64), Config: { Hostname: 'a'.repeat(12), Env: ['SECRET=unchanged'], Labels: { custom: 'keep' } }, HostConfig: { NetworkMode: 'kitchen', Binds: ['kitchen:/data'], PortBindings: { '3000/tcp': [{ HostPort: '3100' }] } }, NetworkSettings: { Networks: { kitchen: { Aliases: ['app', 'a'.repeat(12)], IPAMConfig: null as null | { IPv4Address: string } } } } };
  const result = replacementConfig(container, 'official@sha256:immutable');
  expect(result.Env).toEqual(container.Config.Env);
  expect(result.HostConfig.Binds).toEqual(['kitchen:/data']);
  expect(result.HostConfig.PortBindings).toEqual(container.HostConfig.PortBindings);
  expect(result.NetworkingConfig.EndpointsConfig.kitchen.Aliases).toEqual(['app']);
  expect(result.Hostname).toBeUndefined();
  container.NetworkSettings.Networks.kitchen.IPAMConfig = { IPv4Address: '172.20.0.4' };
  expect(() => replacementConfig(container, 'next')).toThrow('Static');
});
test('release checks are cached, concurrent requests coalesce and manual refresh is throttled', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(release)); vi.stubGlobal('fetch', fetcher);
  const { releaseStatus } = await import('../src/server/kitchen/updates');
  const results = await Promise.all([releaseStatus(), releaseStatus(), releaseStatus(true)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(results[0]).toMatchObject({ installedVersion: '0.8.0', available: true });
  await releaseStatus(true); expect(fetcher).toHaveBeenCalledTimes(1);
});
test('offline release checks report uncertainty without throwing or claiming up-to-date', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const { releaseStatus } = await import('../src/server/kitchen/updates');
  expect(await releaseStatus()).toMatchObject({ installedVersion: '0.8.0', latest: null, available: false, error: expect.stringContaining('Couldn’t check') });
});
test('only a live updater accepts a release request and duplicate submissions are rejected', async () => {
  vi.stubEnv('SOUS_CHEF_UPDATE_DIR', directory);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(release)));
  const { requestUpdate, updaterStatus } = await import('../src/server/kitchen/updates');
  expect((await updaterStatus()).managed).toBe(false);
  await expect(requestUpdate('0.9.0')).rejects.toThrow('not connected');
  await writeFile(join(directory, 'heartbeat'), ''); await writeFile(join(directory, 'status.json'), '{"phase":"idle"}');
  await expect(requestUpdate('0.10.0')).rejects.toThrow('Check for updates');
  await requestUpdate('0.9.0');
  expect(JSON.parse(await readFile(join(directory, 'request.json'), 'utf8'))).toMatchObject({ version: '0.9.0' });
  expect((await stat(join(directory, 'request.json'))).mode & 0o777).toBe(0o660);
  await expect(requestUpdate('0.9.0')).rejects.toThrow('already queued');
  await utimes(join(directory, 'heartbeat'), new Date(0), new Date(0));
  expect((await updaterStatus()).managed).toBe(false);
});
test('demo mode cannot use a configured live updater', async () => {
  vi.stubEnv('SOUS_CHEF_UPDATE_DIR', directory); vi.stubEnv('SOUS_CHEF_DEMO', 'true');
  await writeFile(join(directory, 'heartbeat'), ''); await writeFile(join(directory, 'status.json'), '{"phase":"idle"}');
  const { updaterStatus } = await import('../src/server/kitchen/updates');
  expect(await updaterStatus()).toEqual({ managed: false, job: null });
});

test('host updater IPC does not follow app-created links or expose their contents', async () => {
  const { publish, readRequest } = await import('../scripts/update/ipc.mjs');
  const { symlink, mkdir } = await import('node:fs/promises');
  const privateFile = join(directory, 'private-secret');
  await writeFile(privateFile, 'never expose this');
  const ipc = join(directory, 'ipc'); await mkdir(ipc);
  await symlink(privateFile, join(ipc, 'request.json'));
  await expect(readRequest(join(ipc, 'request.json'))).rejects.toThrow();
  await symlink(privateFile, join(ipc, 'status.json'));
  await publish(ipc, 'status.json', '{"phase":"idle"}');
  expect(await readFile(privateFile, 'utf8')).toBe('never expose this');
  expect(JSON.parse(await readFile(join(ipc, 'status.json'), 'utf8'))).toEqual({ phase: 'idle' });
  await writeFile(join(ipc, 'bad-request'), 'secret malformed payload');
  await expect(readRequest(join(ipc, 'bad-request'))).rejects.toThrow('Invalid update request');
});
