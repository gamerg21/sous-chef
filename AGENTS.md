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

## iOS versions and build numbers

The iOS app's version (`MARKETING_VERSION`) and build number
(`CURRENT_PROJECT_VERSION`) live in the SousChef target of
`ios/SousChef.xcodeproj/project.pbxproj`, and that file is the source of truth.

- Build numbers are plain integers that go up by one for every upload: 1, 2, 3.
  Never use dates, timestamps, or command-line overrides such as
  `CURRENT_PROJECT_VERSION=…`, and don't let Xcode's export options manage the
  number (`manageAppVersionAndBuildNumber` stays `false`).
- Before each TestFlight or App Store upload, increment the build number in the
  project file and commit it with the upload, so the next upload continues from it.
- Every uploaded build gets testing notes: add an entry to
  [ios/TESTFLIGHT.md](ios/TESTFLIGHT.md) in the same commit, covering new
  features, fixes, and any big fix testers should confirm. The upload script
  refuses to run without one and copies it into the build's "What to Test".
- When the version changes (for example 1.0.1 to 1.0.2), reset the build number to 1.
- The ShareExtension target carries the same `MARKETING_VERSION` and
  `CURRENT_PROJECT_VERSION` as the app; change both targets together or the
  upload is rejected.
- App Store Connect rejects a build number that isn't higher than the last one
  uploaded for that version. If an upload is rejected or you don't know the last
  number, ask the maintainer instead of guessing.
- App Intent titles, descriptions and phrases can't mention Apple trademarks
  such as "Apple" or "Siri"; uploads fail with ITMS-90626.
- Upload with `pnpm ios:testflight upload` ([scripts/testflight.mjs](scripts/testflight.mjs)).
  It archives, uploads with the checked-in `ios/ExportOptions.plist`, waits for
  processing, and sets the testing notes; `pnpm ios:testflight notes [build]`
  and `pnpm ios:testflight status` also work on their own. It signs in with the
  Sous Chef team's App Store Connect API key, kept outside the repository: the
  .p8 in `~/.appstoreconnect/private_keys/` and its IDs in
  `~/.appstoreconnect/sous-chef.json`. The `ASC_KEY_ID`/`ASC_ISSUER_ID`
  variables in the maintainer's shell belong to another team; don't use them.
- In `ios/ExportOptions.plist`, never add `testFlightInternalTestingOnly`: it permanently limits a build to
  internal testers, so it can't go to external testers or App Review.

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
