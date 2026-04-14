# Changelog

All notable changes to this project will be documented in this file.

## [v0.2.0] - 2026-04-14

### Added

- Introduced a full Convex backend under `convex/` for users, households, inventory, recipes, shopping lists, cooking, community, integrations, extensions, storage, AI provider settings, and units.
- Added Convex Auth with password-based sign-up/sign-in, password reset, redirect handling, and Convex client bootstrapping.
- Added auth repair flows to recover orphaned password accounts and stale authenticated sessions after the backend migration.
- Added new auth utility modules, Convex client helpers, PWA assets, documentation, migrations, scripts, and tests to support the new architecture.

### Changed

- Migrated the app from Prisma/NextAuth/API-route backed data access to Convex queries, mutations, and HTTP handlers.
- Reworked dashboard pages and shared components to fetch and mutate data through Convex instead of local server routes.
- Normalized auth flows around Convex Auth, including sign-in, sign-up, forgot-password, reset-password, and account profile loading.
- Updated environment examples, middleware, app providers, and project dependencies to reflect the Convex-based stack.

### Fixed

- Fixed authenticated dashboard crashes caused by sessions whose linked `users` document no longer existed after migration.
- Fixed broken sign-in and password reset behavior for legacy password accounts by repairing orphaned auth mappings before login and reset attempts.
- Fixed user deletion cleanup so linked auth sessions, refresh tokens, accounts, and verification codes are removed with the user record.

### Removed

- Removed the legacy `src/app/api/**` route handlers that previously powered auth, inventory, recipes, households, integrations, uploads, and related data operations.
- Removed deprecated Prisma, Supabase, NextAuth, and server-side helper modules that are no longer part of the active backend path.

### Notes

- This release establishes Convex as the primary application backend and auth provider.
- Historical tags created before changelog tracking began: `v0.1.0`, `v0.1.1`, `v0.1.1a`.
