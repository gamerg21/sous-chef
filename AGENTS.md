# Working on Sous Chef

Sous Chef is a self-hostable kitchen app: Next.js, React 19, TypeScript,
Tailwind, and local SQLite. Convex runs only the optional recipe community.
Use Node.js 22.18+ and the exact pnpm version in package.json via Corepack.

## Start here

Read [README.md](README.md), [DEPLOYMENT.md](DEPLOYMENT.md), [DOCKER.md](DOCKER.md),
and [community operations](docs/COMMUNITY.md). Existing data migration is covered
in [SQLITE_MIGRATION.md](docs/SQLITE_MIGRATION.md). Before using a Convex skill,
read [.agents/skills/README.md](.agents/skills/README.md).

## Boundaries

- Private domain functions, auth, schema, and storage: `src/server/kitchen/`.
- UI/routes: `src/app/`, `src/components/`; HTTP hooks: `src/lib/kitchen/`.
- `convex/` contains community accounts/publications only. Never move private
  kitchen state there or require community connectivity for local startup.
- Preserve household membership/roles, unit conversion, and atomic inventory
  deduction. Reuse the typed local API and validators.
- SQLite schema descriptors use indexed JSON records. Treat changes as persistent
  schema migrations; never drop data to make a build pass.
- Keep Convex Auth providers and signing keys intact for community accounts.
- Preserve standalone Next.js output and runtime `/api/config`; no static export.
- Reuse UI primitives and verify affected interactions in a browser.
- Preserve unrelated work, environments, databases, backups, and branding assets.

## Verification

`pnpm dev` starts only Next.js. `pnpm dev:backend` is community-only and must
identify its deployment first. Run appropriate `pnpm test`, `pnpm type-check`,
`pnpm lint`, and `pnpm build`. Vitest covers `tests/` (including SQLite integration)
and `convex/**/*.test.ts`. Documentation changes need `pnpm check:docs` and
`git diff --check`. Doctor checks configuration, not login or email delivery.

Backend deployment, frontend deployment, and end-to-end acceptance are separate.
Do not deploy a community backend merely to test local kitchen/docs changes.

## Installed skills

The canonical skill files live in `.agents/skills/`; `.claude/skills/` links to
those same directories. `skills-lock.json` records upstream provenance. Keep the
Convex-managed block below and generated skill content intact when updating
project guidance. See the skills README for update and integrity checks.

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
