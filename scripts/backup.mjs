import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--deployment' || !args[1] || args[1].startsWith('-')) {
  console.log('Usage: pnpm run backup --deployment <dev|prod|local|deployment-name>');
  console.log('Exports database tables and uploaded files into .backups/. Choose the deployment explicitly.');
  process.exitCode = args.includes('--help') ? 0 : 1;
} else {
  process.umask(0o077);
  const folder = join(process.cwd(), '.backups');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const path = join(folder, `sous-chef-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`);
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'convex', 'export', '--deployment', args[1], '--include-file-storage', '--path', path], { stdio: 'inherit', shell: false });
  if (existsSync(path)) chmodSync(path, 0o600);
  if (result.error) console.error('Could not run the Convex CLI. Install dependencies and try again.');
  process.exitCode = result.status ?? 1;
  if (process.exitCode === 0) console.log('Backup saved. Keep this private: it includes household data and authentication records. Deployment environment secrets need a separate secure backup.');
}
