# Contributing

Use Node.js 22.18+, Corepack, and the exact pnpm version in `package.json`.
Run `pnpm install --frozen-lockfile` and `pnpm dev`; no backend account is needed.
Read [README](README.md), [local development](docs/LOCAL_DEVELOPMENT.md), and
[AGENTS](AGENTS.md) before changing code.

- `src/app/` and `src/components/`: Next.js UI and HTTP routes.
- `src/server/kitchen/`: SQLite schema, transactions, auth, files, and domain operations.
- `src/lib/kitchen/`: typed local HTTP client and React hooks.
- `src/lib/community-contract.ts`: versioned public recipe format.
- `convex/`: optional community backend only.
- `tests/sqlite/`: real SQLite domain/security regression tests.

Preserve household authorization and unit-aware cooking transactions. Do not make
local startup depend on the community. Add a schema migration/version when
changing persistent structures; never silently discard data. Preserve existing
Convex authentication keys when working on the community service.

Run `pnpm test`, `pnpm type-check`, `pnpm lint`, and `pnpm build` for behavior
changes. Run `pnpm check:docs` and `git diff --check` for documentation. Verify
UI interactions in a browser and keep deployment, build, and acceptance evidence separate.
