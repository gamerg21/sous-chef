import { cp, mkdir, chmod, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
await mkdir('dist', { recursive: true });
const staging = await mkdtemp(resolve('dist/.package-'));
const root = join(staging, 'sous-chef');
const standalone = resolve('.next/standalone');
try {
  await mkdir(root);
  // Trace output can contain local development files. Only package runtime roots.
  const allowed = new Set(['.next', 'node_modules', 'package.json', 'server.js', 'scripts', 'public']);
  await cp(standalone, join(root, 'app'), { recursive: true, verbatimSymlinks: true, filter: source => {
    const parts = relative(standalone, source).split('/');
    return (!parts[0] || allowed.has(parts[0])) && !parts.some(part => part.startsWith('.env') || /\.(sqlite(?:-wal|-shm)?|pem|key)$/.test(part));
  } });
  await cp('.next/static', join(root, 'app/.next/static'), { recursive: true });
  await cp('public', join(root, 'app/public'), { recursive: true });
  await cp('LICENSE', join(root, 'LICENSE'));
  const license = await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`, { signal: AbortSignal.timeout(15000) });
  if (!license.ok) throw new Error('Could not include the bundled Node license.');
  await writeFile(join(root, 'NODE_LICENSE'), await license.text());
  await cp(process.execPath, join(root, 'node'));
  await chmod(join(root, 'node'), 0o755);
  await mkdir(join(root, 'scripts'));
  await cp('scripts/updater.mjs', join(root, 'scripts/updater.mjs'));
  await cp('scripts/update', join(root, 'scripts/update'), { recursive: true });
  await writeFile(join(root, 'start.sh'), '#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$ROOT/node" "$ROOT/scripts/updater.mjs" --portable "$ROOT" --state "$ROOT/updates" "$@"\n', { mode: 0o755 });
  execFileSync('tar', ['-czf', `dist/sous-chef-${process.platform}-${process.arch}.tar.gz`, '-C', staging, 'sous-chef']);
} finally { await rm(staging, { recursive: true, force: true }); }
