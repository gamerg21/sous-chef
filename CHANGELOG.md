# Changelog

All notable changes to this project will be documented in this file.

## Kitchen workflow completion

- Review and stock checked purchases with quantities, units, locations, and expiry dates.
- Calculate cooking readiness and shopping shortages from actual quantities and compatible units; explicitly review uncertain amounts.
- Paste recipe text into an editable draft; fix saving and editing recipes with ingredients.
- Show cooking instructions alongside exact inventory changes and prevent duplicate saves.
- Keep unfinished extensions out of the everyday journey: the extension catalog and third-party integrations left the main navigation, listings cannot be installed and integrations cannot be connected until an adapter exists, and placeholder reviews were removed.
- AI provider settings moved to Settings → AI settings; the account menu now links to account preferences, household members, and AI settings. Old `/extensions/integrations` links redirect.
- Community copy states that sharing stays within this instance.
- One-command home server: `./homelab.sh up` runs the open-source Convex backend, a keygen sidecar, an idempotent setup job (function deploy, `SITE_URL`, Convex Auth keys, encryption key, units seed), and the web app. The same setup job configures a Convex Cloud deployment from a deploy key. Images for the app and the setup job publish to GitHub Container Registry for amd64 and arm64.

## [Unreleased]

### Security

- Enforced household-membership checks on every read query that accepts an explicit `householdId` (inventory, recipes, shopping list, cooking, integrations, AI providers).
- `community.saveRecipe` and `community.likeRecipe` now verify recipe visibility — private recipes from other households can no longer be copied or liked by ID.
- `storage.getUrl` now requires authentication, and `storage.saveStorageId` verifies household ownership of the target recipe/inventory item.
- Rate-limited the unauthenticated auth-repair mutation (per email) and password-reset email sending, using the previously unused `authRateLimitEvents` table.
- AI provider API keys and integration tokens are now encrypted at rest with AES-256-GCM when `SECRETS_ENCRYPTION_KEY` is set on the Convex deployment.
- Household owner role can only move via explicit ownership transfer (old owner becomes admin); admins can no longer demote the owner. The last app admin can no longer be removed.
- `admin.deleteUser` now also cleans up community likes/saves and unit-usage data; `users.updateProfile` validates email format/uniqueness and keeps the password sign-in identifier in sync.

### Added

- Full unit system per the unit-picker spec: seedable catalog with aliases and ingredient-unit profiles (`pnpm seed:units`), ranked suggestion/search/usage-tracking functions, and an accessible combobox unit picker with a grouped "More units…" modal.
- Custom calendar date picker for inventory expiration dates (replaces the native browser input).
- Convex-native barcode lookup backed by Open Food Facts with local caching in the `barcodes` table (replaces the removed `/api/barcode/lookup` route; scans now work again and get faster over time).
- Recipe JSON import/export as Convex functions (replaces the removed `/api/recipes/*` routes).
- Recipe photo upload via Convex storage (replaces the removed `/api/upload/recipe` route).
- AI provider "test key" action that pings the provider and records `lastTestedAt`/status (replaces the removed `/api/ai/providers/:id/test` route).
- Community recipes can now be published as `unlisted` and unpublished back to private.
- Household member management UI is now functional (add existing users by email, change roles, transfer ownership, remove members).
- "Surprise me" opens a random cookable recipe; community "View all" navigates to the browse page.
- Vitest + convex-test test suite (52 tests) covering security rules, the unit system, and cooking, run in CI and the pre-commit hook via `pnpm test`.

### Changed

- Portable Docker runtime configuration, setup diagnostics, and complete Convex Auth setup instructions.
- Password recovery honors SITE_URL and explains operator-assisted recovery when email is unavailable.
- Working household switching, single-render responsive dashboard, mobile summaries, and accessible nested dialogs.
- Full shopping quantity/unit editing with preserved failed drafts and atomic clearing of checked items.
- Cooking tracks stock consumed by repeated ingredient rows and prevents duplicate confirmation submissions.

- Cooking now deducts inventory unit-aware (e.g. 500 ml from a 1 l bottle) and skips deduction instead of subtracting nonsense when units are incompatible; qualitative units ("to taste") are never deducted.
- Recipe ingredient→inventory mapping moved from the `MAPPING:` note prefix to a real `mappingLabel` field (legacy rows still read correctly).
- `/` now redirects to the dashboard instead of a static component showcase; `/settings` redirects to household user management.
- Community and admin list queries are bounded instead of scanning whole tables.

### Removed

- Orphaned magic-link `verify-request` page, dead test files for modules deleted in the Convex migration, and stale Prisma references in `tsconfig.json`, `eslint.config.mjs`, and docs (including the obsolete Windows/Prisma setup guide).

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

### Optional pantry AI and home backups

- Generate a reviewable recipe draft from pantry contents using a configured OpenAI, Anthropic, or Google model.
- Add provider model selection, encrypted new keys, bounded requests, household limits, and explicit provider-data disclosure.
- Add a private database-and-file export command with an explicit deployment target and a restore-drill guide.
