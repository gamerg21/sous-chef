# Working on Sous Chef

Sous Chef is a self-hostable kitchen app: Next.js App Router, React 19, TypeScript,
Tailwind CSS, and Convex with Convex Auth. Use Node.js 22 and the exact pnpm version
in `package.json` (`corepack enable`).

## Start here

- Read [README.md](README.md) for implemented features and planned work.
- Use [docs/CONVEX_SETUP.md](docs/CONVEX_SETUP.md) for first-run setup and auth.
- Use [DEPLOYMENT.md](DEPLOYMENT.md) and [DOCKER.md](DOCKER.md) for deployment.
- Before applying any installed Convex skill, read
  [.agents/skills/README.md](.agents/skills/README.md). Its repository-specific
  adaptations take precedence over generic skill procedures and remote catalogs.

## Code and data boundaries

- `src/app/`: routes and server endpoints; `src/components/`: feature UI and shared primitives.
- `src/lib/`: frontend utilities and domain helpers; `convex/`: backend functions,
  schema, authentication, authorization, and storage; `tests/`: unit tests.
- Preserve household isolation, membership roles, unit conversion, and inventory
  deduction semantics. Reuse existing authorization helpers and generated APIs.
- Preserve existing Convex Auth configuration and signing/encryption keys. Do not
  replace auth providers or scaffold over this existing app during setup.
- Next.js uses standalone production output and `/api/config` for runtime backend
  configuration. Keep server routes and runtime configuration working; this is not
  a static-export app.
- Reuse existing UI primitives. For UI changes, inspect the affected screen and
  verify the requested viewport and interaction; a build alone is not visual proof.

## Commands and verification

- `pnpm dev` starts both Next.js and the Convex watcher. If Convex is already
  running, use `pnpm dev:frontend`; do not start a duplicate watcher.
- `pnpm run doctor` checks configuration/reachability, not login or email delivery.
- Run checks appropriate to the change: `pnpm test`, `pnpm type-check`,
  `pnpm lint`, and `pnpm build`. Vitest covers `tests/` and `convex/**/*.test.ts`.
- For documentation/skill changes, run `pnpm run check:docs` and
  `git diff --check`; application tests are needed only if behavior changes.
- Identify the intended deployment before backend commands. Backend pushes,
  frontend deployment, and end-to-end acceptance are separate verification steps.
  Do not deploy simply to validate a documentation change.
- Follow the user's authorized scope. Preserve unrelated working-tree changes;
  never overwrite existing secrets or commit local environments and backups.

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
