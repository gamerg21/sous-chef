# Local development

Use Node.js 22.18+ and the pinned pnpm version (`corepack enable`). Run
`pnpm install --frozen-lockfile`, then `pnpm dev`. Only Next.js starts; SQLite
initializes under `./data`. No `.env` file or Convex deployment is required.

Copy `.env.example` to `.env.local` when changing settings. Use
`SOUS_CHEF_DATA_DIR=/absolute/path` for a separate test kitchen and `APP_URL` for
the browser origin behind a reverse proxy. Do not commit data, backups, or keys.

`pnpm setup:backend` initializes the local schema/unit catalog manually;
`pnpm seed:units` is idempotent. Community developers can separately run
`pnpm dev:backend` against a known deployment. Never start it to test local kitchen changes.

Checks: `pnpm test`, `pnpm type-check`, `pnpm lint`, `pnpm build`,
`pnpm check:docs`, and `git diff --check`. SQLite integration tests live under
`tests/sqlite/`; cloud tests under `convex/`. UI work needs a browser interaction
check in addition to compilation. Use [backup/recovery](BACKUP.md) and
[community operations](COMMUNITY.md) for those workflows.
