import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { request } from 'node:http';
import { mkdir, readFile, writeFile, cp, rm, rename, symlink, realpath, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { IMAGE, portableAsset } from './releases.mjs';
const exec = promisify(execFile);
export async function command(file, args) {
  // Never return subprocess output to the app: inspect output can contain secrets.
  try { return (await exec(file, args, { maxBuffer: 16 * 1024 * 1024, timeout: 15 * 60000 })).stdout; }
  catch (cause) { throw new Error(`${file} operation failed. See the updater host and retained backup.`, { cause }); }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function healthy(url, version, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      const info = await fetch(new URL('/api/version', url), { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (health.ok && info.ok && (await info.json()).version === version) return;
    } catch { /* Expected during restart. */ }
    await sleep(1500);
  }
  throw new Error('The new version did not pass its startup checks.');
}
export function replacementConfig(container, image) {
  const networks = container.NetworkSettings.Networks;
  if (Object.values(networks).some(network => network.IPAMConfig?.IPv4Address || network.IPAMConfig?.IPv6Address)) {
    throw new Error('Static container IPs require a manual update.');
  }
  if (!['', 'default', 'bridge', 'host', ...Object.keys(networks)].includes(container.HostConfig.NetworkMode)) {
    throw new Error('This container network mode requires a manual update.');
  }
  if (Object.values(container.HostConfig.PortBindings || {}).some(bindings => bindings?.some(binding => !binding.HostPort || binding.HostPort === '0'))) {
    throw new Error('Ephemeral published ports require a manual update. Set a fixed host port first.');
  }
  const config = { ...container.Config, Image: image, HostConfig: { ...container.HostConfig, AutoRemove: false } };
  if (config.Hostname === container.Id.slice(0, 12)) delete config.Hostname;
  config.NetworkingConfig = { EndpointsConfig: Object.fromEntries(Object.entries(networks).map(([name, network]) => [name, {
    Aliases: network.Aliases?.filter(alias => alias !== container.Id.slice(0, 12) && alias !== container.Id),
  }])) };
  return config;
}
export async function createContainer(socketPath, name, config) {
  await new Promise((resolve, reject) => {
    const req = request({ socketPath, path: `/containers/create?name=${encodeURIComponent(name)}`, method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 30000 }, response => {
      response.resume();
      response.on('end', () => response.statusCode === 201 ? resolve() : reject(new Error('Docker could not create the replacement container.')));
    });
    req.on('error', () => reject(new Error('Docker socket is unavailable.')));
    req.on('timeout', () => req.destroy(new Error('Docker request timed out.')));
    req.end(JSON.stringify(config));
  });
}
export async function dockerAdapter(name, state, url, { run = command, create = createContainer, check = healthy } = {}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error('Invalid container name');
  const context = JSON.parse(await run('docker', ['context', 'inspect']))[0];
  const endpoint = process.env.DOCKER_HOST || context.Endpoints.docker.Host;
  if (!endpoint.startsWith('unix://')) throw new Error('Managed updates require a local Docker Unix socket.');
  const socket = endpoint.slice(7);
  return {
    async install(release, report) {
      const original = JSON.parse(await run('docker', ['inspect', name]))[0];
      const data = original.Mounts.find(mount => mount.Destination === '/data' && mount.RW && ['bind', 'volume'].includes(mount.Type));
      if (!data || original.Config.Env.some(value => value.startsWith('SOUS_CHEF_DATA_DIR=') && value !== 'SOUS_CHEF_DATA_DIR=/data')) throw new Error('Managed Docker updates require a persistent /data mount.');
      const previousVersion = (await fetch(new URL('/api/version', url), { signal: AbortSignal.timeout(5000) }).then(r => r.json())).version;
      replacementConfig(original, ''); // Validate before downloading or stopping anything.
      await report('downloading', 'Downloading the new release…');
      await run('docker', ['pull', `${IMAGE}:${release.version}`]);
      const image = JSON.parse(await run('docker', ['image', 'inspect', `${IMAGE}:${release.version}`]))[0];
      if (image.Config.Labels?.['org.opencontainers.image.version'] !== release.version) throw new Error('The image version does not match this release.');
      const pinned = image.RepoDigests?.find(value => value.startsWith(`${IMAGE}@sha256:`));
      if (!pinned) throw new Error('The release image has no immutable digest.');
      const config = replacementConfig(original, pinned);
      config.Labels = { ...config.Labels, ...image.Config.Labels };
      const ownership = JSON.parse(await run('docker', ['exec', name, 'node', '-e', "const s=require('node:fs').statSync('/data/kitchen.sqlite');console.log(JSON.stringify({uid:s.uid,gid:s.gid}));"]));
      const backup = join(state, 'backups', `${Date.now()}-${previousVersion}`);
      await mkdir(backup, { recursive: true, mode: 0o700 });
      await writeFile(join(backup, 'container.json'), JSON.stringify(original), { mode: 0o600 });
      const previous = `${name}-previous-${Date.now()}`;
      let stopped = false, renamed = false, created = false, backedUp = false;
      try {
        await report('backing-up', 'Backing up your kitchen. The app will reconnect after restarting…');
        await run('docker', ['stop', '--time', '30', name]); stopped = true;
        await run('docker', ['cp', `${name}:/data/.`, join(backup, 'data')]);
        await access(join(backup, 'data', 'kitchen.sqlite')); backedUp = true;
        await run('docker', ['rename', name, previous]); renamed = true;
        await create(socket, name, config); created = true;
        await report('restarting', 'Starting the new version…');
        await run('docker', ['start', name]);
        await check(url, release.version);
        await report('complete', `Updated to ${release.version}. Your backup is retained on the server.`);
        // Keep the stopped previous container, exact image, configuration and backup for recovery.
      } catch (error) {
        if (stopped) {
          await report('rolling-back', 'The update failed. Restoring the previous version…');
          try {
            if (created) await run('docker', ['rm', '-f', name]);
            if (created && backedUp) {
              const mount = data.Type === 'volume' ? `type=volume,src=${data.Name},dst=/data` : `type=bind,src=${data.Source},dst=/data`;
              // All app processes are stopped. Remove only database runtime files before restoring the complete snapshot.
              await run('docker', ['run', '--rm', '--network', 'none', '--user', '0', '--mount', mount, '--entrypoint', 'node', original.Image, '-e', "const fs=require('node:fs');for(const n of ['kitchen.sqlite','kitchen.sqlite-wal','kitchen.sqlite-shm'])fs.rmSync('/data/'+n,{force:true});"]);
              await run('docker', ['cp', `${join(backup, 'data')}/.`, `${previous}:/data`]);
              await run('docker', ['run', '--rm', '--network', 'none', '--user', '0', '--mount', mount, '--entrypoint', 'node', original.Image, '-e', `const fs=require('node:fs');const owner=${JSON.stringify(ownership)};function fix(p){const s=fs.lstatSync(p);if(s.isSymbolicLink())return;fs.chownSync(p,owner.uid,owner.gid);if(s.isDirectory())for(const n of fs.readdirSync(p))fix(p+'/'+n);}fix('/data');`]);
            }
            if (renamed) await run('docker', ['rename', previous, name]);
            await run('docker', ['start', name]);
            await check(url, previousVersion);
          } catch (cause) {
            const failure = new Error('Update and automatic recovery failed. Stop the app and restore the retained backup on the updater host.', { cause: { update: error, recovery: cause } });
            failure.recoveryRequired = true;
            throw failure;
          }
        }
        throw error;
      }
    },
  };
}
export async function portableAdapter(root, state, url, { check = healthy } = {}) {
  const data = resolve(process.env.SOUS_CHEF_DATA_DIR || join(root, 'data'));
  const current = join(root, 'current');
  try { await access(current); } catch { await symlink(join(root, 'app'), current); }
  let child;
  let stopping = false;
  let generation = 0;
  async function start() {
    const thisGeneration = ++generation;
    const app = await realpath(current);
    child = spawn(join(dirname(app), 'node'), [join(app, 'server.js')], {
      cwd: app, stdio: 'inherit', env: { ...process.env, SOUS_CHEF_DATA_DIR: data, SOUS_CHEF_UPDATE_DIR: join(state, 'ipc'), HOSTNAME: process.env.HOSTNAME_BIND || '0.0.0.0' },
    });
    child.on('error', error => console.error('App process failed:', error.message));
    child.on('exit', () => { if (!stopping) {
      console.error('App exited; restarting in five seconds.');
      setTimeout(() => { if (!stopping && generation === thisGeneration) void start().catch(error => console.error(error.message)); }, 5000).unref();
    } });
  }
  async function stop() {
    stopping = true; generation++;
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
      await exited; clearTimeout(timer);
    }
  }
  async function point(app) {
    const temporary = `${current}.next`;
    await rm(temporary, { force: true }); await symlink(app, temporary); await rename(temporary, current);
  }
  await start();
  return {
    stop,
    async install(release, report) {
      const asset = portableAsset(release, process.platform, process.arch);
      const oldApp = await realpath(current);
      const oldVersion = JSON.parse(await readFile(join(oldApp, 'package.json'), 'utf8')).version;
      await report('downloading', 'Downloading the new release…');
      const destination = join(root, 'releases', `${release.version}-${Date.now()}`);
      await mkdir(destination, { recursive: true, mode: 0o700 });
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(10 * 60000) });
      if (!response.ok) throw new Error('Could not download this release.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 1024 ** 3 || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error('Release checksum verification failed.');
      const archive = join(destination, 'release.tar.gz');
      await writeFile(archive, bytes, { mode: 0o600 });
      const entries = (await command('tar', ['-tzf', archive])).trim().split('\n');
      if (entries.some(entry => !entry.startsWith('sous-chef/') || entry.split('/').includes('..'))) throw new Error('Invalid release archive');
      await command('tar', ['-xzf', archive, '-C', destination]);
      const nextApp = join(destination, 'sous-chef', 'app');
      if (JSON.parse(await readFile(join(nextApp, 'package.json'), 'utf8')).version !== release.version) throw new Error('Release version mismatch');
      const backup = join(state, 'backups', `${Date.now()}-${oldVersion}`);
      await mkdir(backup, { recursive: true, mode: 0o700 });
      let backedUp = false, switched = false;
      await report('backing-up', 'Backing up your kitchen. The app will reconnect after restarting…');
      await stop();
      try {
        await cp(data, join(backup, 'data'), { recursive: true });
        await access(join(backup, 'data', 'kitchen.sqlite'));
        await writeFile(join(backup, 'recovery.json'), JSON.stringify({ app: oldApp, data }), { mode: 0o600 });
        if (process.env.SECRETS_ENCRYPTION_KEY) await writeFile(join(backup, 'secrets.key'), process.env.SECRETS_ENCRYPTION_KEY, { mode: 0o600 });
        backedUp = true;
        await point(nextApp); switched = true;
        await report('restarting', 'Starting the new version…');
        stopping = false; await start(); await check(url, release.version);
        await report('complete', `Updated to ${release.version}. Your backup is retained on the server.`);
      } catch (error) {
        await report('rolling-back', 'The update failed. Restoring the previous version…');
        try {
          await stop();
          if (switched && backedUp) {
            // Retain the failed state for diagnosis instead of discarding new data.
            await rename(data, `${data}.failed-${Date.now()}`);
            await cp(join(backup, 'data'), data, { recursive: true });
          }
          await point(oldApp); stopping = false; await start(); await check(url, oldVersion);
        } catch (cause) {
          const failure = new Error('Update and automatic recovery failed. Restore the retained backup on the updater host.', { cause });
          failure.recoveryRequired = true;
          throw failure;
        }
        throw error;
      }
    },
  };
}
