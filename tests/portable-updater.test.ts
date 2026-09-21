import { expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { command, healthy, portableAdapter } from '../scripts/update/adapters.mjs';
import { RELEASES_URL } from '../scripts/update/releases.mjs';

test('portable update verifies download, switches release and restores data/key after a failed migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sous-chef-portable-test-'));
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const oldPort = process.env.PORT; process.env.PORT = String(port);
  const state = join(root, 'updates'); await mkdir(state);
  const source = `const fs=require('node:fs'),http=require('node:http'),path=require('node:path');const {DatabaseSync}=require('node:sqlite');const version=require('./package.json').version;const data=process.env.SOUS_CHEF_DATA_DIR;fs.mkdirSync(data,{recursive:true});const db=new DatabaseSync(path.join(data,'kitchen.sqlite'));db.exec('PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS sample(value TEXT);');if(!db.prepare('SELECT * FROM sample').get())db.exec("INSERT INTO sample VALUES('original')");if(version==='0.9.0')db.exec("UPDATE sample SET value='good migration'");if(version==='0.10.0')db.exec("UPDATE sample SET value='bad migration'");if(!fs.existsSync(path.join(data,'secrets.key')))fs.writeFileSync(path.join(data,'secrets.key'),'fixture-key');http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');if(q.url==='/api/version')return r.end(JSON.stringify({version}));if(q.url==='/api/health'){r.statusCode=version==='0.10.0'?503:200;return r.end('{}');}r.end(JSON.stringify(db.prepare('SELECT * FROM sample').get()));}).listen(process.env.PORT,'127.0.0.1');process.on('SIGTERM',()=>{db.close();process.exit();});`;
  async function fixture(directory: string, version: string) {
    await mkdir(join(directory, 'app'), { recursive: true });
    await symlink(process.execPath, join(directory, 'node'));
    await writeFile(join(directory, 'app/server.js'), source);
    await writeFile(join(directory, 'app/package.json'), JSON.stringify({ version }));
  }
  await fixture(root, '0.8.0');
  const url = `http://127.0.0.1:${port}`;
  const originalFetch = globalThis.fetch;
  const adapter = await portableAdapter(root, state, url, { check: (origin: string, version: string) => healthy(origin, version, 3000) });
  try {
    await healthy(url, '0.8.0', 10000);
    const phases: string[] = []; const report = async (phase: string) => { phases.push(phase); };
    for (const version of ['0.9.0', '0.10.0']) {
      const bundle = join(root, `fixture-${version}`); await fixture(join(bundle, 'sous-chef'), version);
      const archive = join(bundle, 'release.tar.gz'); await command('tar', ['-czf', archive, '-C', bundle, 'sous-chef']);
      const bytes = await readFile(archive);
      const name = `sous-chef-${process.platform}-${process.arch}.tar.gz`;
      const download = `${RELEASES_URL}/download/v${version}/${name}`;
      globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => String(input) === download ? Promise.resolve(new Response(bytes)) : originalFetch(input, init)) as typeof fetch;
      const release = { version, assets: [{ name, browser_download_url: download, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }] };
      if (version === '0.9.0') await adapter.install(release, report);
      else await expect(adapter.install(release, report)).rejects.toThrow('startup checks');
    }
    expect(phases).toContain('complete'); expect(phases).toContain('rolling-back');
    expect(await originalFetch(`${url}/api/version`).then(r => r.json())).toEqual({ version: '0.9.0' });
    expect(await originalFetch(url).then(r => r.json())).toEqual({ value: 'good migration' });
    expect(await readFile(join(root, 'data/secrets.key'), 'utf8')).toBe('fixture-key');
  } finally {
    globalThis.fetch = originalFetch; await adapter.stop();
    if (oldPort === undefined) delete process.env.PORT; else process.env.PORT = oldPort;
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
