// Isolated lifecycle integration test. Requires Docker; never uses an existing kitchen.
// Registry delivery is stubbed with locally built fixtures; all container/data operations are real.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command, createContainer, dockerAdapter, healthy } from './update/adapters.mjs';
import { createServer } from 'node:net';
import { IMAGE } from './update/releases.mjs';
const directory = await mkdtemp(join(tmpdir(), 'sous-chef-docker-updates-'));
const id = `sous-chef-update-test-${Date.now()}`;
const volume = `${id}-data`;
const images = [];
const state = join(directory, 'state'); await mkdir(state);
const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
try {
  await writeFile(join(directory, 'server.cjs'), `
const fs = require('node:fs'); const http = require('node:http'); const {DatabaseSync} = require('node:sqlite');
const version = fs.readFileSync('/app/version','utf8').trim();
const db = new DatabaseSync('/data/kitchen.sqlite'); db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sample(value TEXT);');
if(!db.prepare('SELECT * FROM sample').get())db.prepare('INSERT INTO sample VALUES(?)').run('original');
if(version==='0.9.0')db.prepare('UPDATE sample SET value=?').run('successful migration');
if(version==='0.10.0')db.prepare('UPDATE sample SET value=?').run('failed migration');
if(!fs.existsSync('/data/secrets.key'))fs.writeFileSync('/data/secrets.key','fixture-key');
http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/api/version')return res.end(JSON.stringify({version}));if(req.url==='/api/health'){res.statusCode=version==='0.10.0'?503:200;return res.end('{}');}res.end(JSON.stringify({value:db.prepare('SELECT * FROM sample').get().value,key:fs.readFileSync('/data/secrets.key','utf8')}));}).listen(3000,'0.0.0.0');
process.on('SIGTERM',()=>{db.close();process.exit();});
`);
  for (const version of ['0.8.0', '0.9.0', '0.10.0']) {
    const tag = `${id}:${version}`; images.push(tag);
    await writeFile(join(directory, 'version'), version);
    await writeFile(join(directory, 'Dockerfile'), `FROM node:22.18-alpine\nWORKDIR /app\nRUN mkdir /data && chown 1001:1001 /data\nCOPY server.cjs version ./\nLABEL org.opencontainers.image.version="${version}"\nENV SOUS_CHEF_DATA_DIR=/data\nUSER 1001:1001\nCMD ["node","/app/server.cjs"]\n`);
    await command('docker', ['build', '-q', '-t', tag, directory]);
  }
  await command('docker', ['run', '-d', '--name', id, '-p', `127.0.0.1:${port}:3000`, '-v', `${volume}:/data`, images[0]]);
  const url = `http://127.0.0.1:${port}`;
  await healthy(url, '0.8.0', 20000);
  let target;
  const adapter = await dockerAdapter(id, state, url, {
    run: async (file, args) => {
      if (args[0] === 'pull') { target = args[1].split(':').at(-1); return ''; }
      if (args[0] === 'image' && args[1] === 'inspect' && args[2].startsWith(IMAGE)) {
        const image = JSON.parse(await command(file, ['image', 'inspect', `${id}:${target}`]))[0];
        image.RepoDigests = [`${IMAGE}@${image.Id}`];
        return JSON.stringify([image]);
      }
      return command(file, args);
    },
    create: (socket, name, config) => createContainer(socket, name, { ...config, Image: `${id}:${target}` }),
    check: (origin, version) => healthy(origin, version, 5000),
  });
  const phases = [];
  const report = async phase => { phases.push(phase); };
  await adapter.install({ version: '0.9.0' }, report);
  assert.equal(phases.at(-1), 'complete');
  assert.deepEqual(await fetch(url).then(r => r.json()), { value: 'successful migration', key: 'fixture-key' });
  await assert.rejects(adapter.install({ version: '0.10.0' }, report), /startup checks/);
  assert.ok(phases.includes('rolling-back'));
  assert.equal((await fetch(`${url}/api/version`).then(r => r.json())).version, '0.9.0');
  assert.deepEqual(await fetch(url).then(r => r.json()), { value: 'successful migration', key: 'fixture-key' });
  console.log('PASS: Docker upgrade, migration, failed startup, database/key rollback, and original port preservation.');
} finally {
  const containers = (await command('docker', ['ps', '-a', '--format', '{{.Names}}'])).trim().split('\n').filter(name => name === id || name.startsWith(`${id}-previous-`));
  for (const name of containers) await command('docker', ['rm', '-f', name]).catch(() => {});
  await command('docker', ['volume', 'rm', volume]).catch(() => {});
  for (const image of images) await command('docker', ['image', 'rm', image]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
