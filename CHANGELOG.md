## Unreleased

- iOS: the recipe editor sheet can't be swiped closed while it holds unsaved work (any edit, or an imported recipe not yet saved), so a fast swipe-to-delete on a step no longer dismisses the whole sheet. Cancel then asks to discard. A blank new recipe or an unchanged one still swipes closed.
- Used vs. thrown away on iOS: the Pantry shows this month's tally ("N used · N thrown away") next to "Use soon". Running a dated item out by hand counts it as used when it's not past its date (one rule, `PantryOutcome.whenEmptied`, used by the Use swipe, the item editor and Siri's "I ran out"). For food past its date the app asks **Used** or **Thrown away**, records the answer, and keeps the item as Out (quantity 0) instead of deleting it. Offline cooking records a dated item cooked to nothing as used, matching the server; server-side cooking is not recorded twice.
- New synced model `PantryOutcome` (in `KitchenSchema.models`; new CloudKit record type) with `SyncKind.outcome`. Companion sync pushes outcomes through the new `expiry:record` operation and pulls this and last month's through `expiry:list`, matching by server ID and then by `clientId`. Servers without those operations are skipped, as with meal planning; `inventory:remove` takes no new arguments.
- Server: `pantryOutcomes` gains an optional `clientId` and a `by_householdId_and_clientId` index (additive; created on startup). New operations `expiry:record` (idempotent by `clientId` within a household), `expiry:list {month?}` and `expiry:settle {id, outcome}` (records and sets quantity to 0). `inventory:remove` no longer records an outcome for an item that's already out of stock.
- Web: expired items in the "Use it up" card have **Used** and **Thrown away** buttons that record the outcome and leave the item out of stock. Removing an expired, in-stock item asks the same question and now keeps it as out of stock instead of deleting it; iOS's Delete (swipe, menu and the item editor) does the same.
- An item that runs out loses its expiry date, so an Out item no longer shows "Expired" and restocking it doesn't bring back the old date; the recorded outcome keeps the date. Server: `inventory:update` clears `expiresOn` whenever the resulting quantity is 0, `expiry:settle` clears it too, and opening the SQLite database clears dates left on items already out. iOS: `PantryItem.setQuantity` clears the date when stock runs out or is restocked from Out, used by the Use swipe, `settle`, Siri's "I ran out" and the item editor; Out rows hide any older date. On the web, setting a dated item's quantity to 0 in the editor now counts it as iOS does: used before its date, or asks "Used it up" or "Thrown away" once it's past (`inventory:update` takes an optional `outcome`, recorded only as the item runs out).
- Expiry reminders mention expired food only through the day after its date, then stop (`REMINDER_DAYS_PAST_DATE` / `findReminderItems` on the web, `ExpiringFood.reminderItems` on iOS). Lists such as "Use it up" and "Use soon" still show expired stock.
- Tests: SQLite tests for `expiry:record`, `expiry:list`, `expiry:settle` and the no-double-count rule; iOS `PantryOutcomeTests` and new reminder cases in `ExpiryRemindersTests`.
- iOS: cook timer Live Activity polish. The Lock Screen lists two timers under the next one and, from four timers on, one plus a brand-coloured "+N more" line (finished timers count), keeping within the Lock Screen's height. The smaller rows on the Lock Screen and in the expanded Dynamic Island show timers with an hour or more to go as "2h 59m" (a narrow `Duration.UnitsFormatStyle`, rounded down, rendered with `Text(.durationOffset(to:), format:)` so it ticks without updates); the big countdowns and the compact island keep the clock. The next timer reads "Done" once the activity goes stale (its stale date is that timer's end), the Lock Screen shows a static "Done at 6:42 PM" beside it, the alarm's Stop button (`StopCookTimerAlarmIntent`, a `LiveActivityIntent`) and Open button re-sort the activity from its own state via `CookTimerAlerts.refreshActivity()`, and cook mode re-syncs when it returns to the foreground. A true "Done" without opening the app relies on alarms being allowed. Ordering, "+N more", stale and format helpers live in `CookTimerAttributes` and are unit-tested.
- iOS: timer notifications for timers without an alarm (alarms not allowed, or on a Mac) are Time Sensitive, so they break through Focus; timers with an alarm keep an ordinary notification. Adds the `com.apple.developer.usernotifications.time-sensitive` entitlement, and the App ID now has the Time Sensitive Notifications capability (registered by Xcode's automatic signing; the App Store Connect API can't set it). Settings notes when Time Sensitive notifications are switched off and timers have no alarm.
- iOS: a Plan screen inside Cook for the weekly meal plan.
- iOS: cook mode can set a custom timer on any step from a kitchen-timer dial, with quick-add buttons and an optional name. A small + sits beside a step's own timers, or "Add a timer" when the step doesn't mention a time.
- iOS: cook timers ring as alarms, like the Clock app's timers: through silent mode and Focus, until stopped, with an Open button that returns to cook mode. Every timer also gets a notification with sound, so a finished timer is still heard if its alarm doesn't ring or alarms aren't allowed. Alarms are drawn by the widget extension, which a ringing alarm needs in order to appear and sound.
- iOS: Settings is reorganized into a short list of groups that each open their own page: Sync and Storage (iCloud, companion server, recipe backup), Notifications (permissions and expiry reminders), Intelligence and Lookups (Apple Intelligence, Open Food Facts) and Community (account, safety, community address). Rows show a summary, such as where the kitchen syncs, and Notifications flags permissions that need attention.
- iOS: Settings shows whether notifications, timer alarms and Live Activities are on, asks for any not set up yet, and links to the Settings app for anything turned off. Cook mode says so when notifications and alarms are both off and timers can only alert inside the app.
- iOS: onboarding ends with a page that explains expiry reminders and cook timers and asks for notification and alarm permission up front, instead of prompting when the first timer starts. Saying yes also turns on the daily expiry reminder. The alarm prompt now waits for the notification prompt to close, since asking while it was still closing could turn alarms off without showing a prompt.
- iOS: an opt-in daily local reminder at a time you choose, only on days something expires. It opens Cook's new **Use it up** list or the Pantry's "Use soon" section.
- iOS: cook timers show as a Live Activity on the Lock Screen and in the Dynamic Island, and each timer alerts with sound when it finishes, even with the app in the background.
- iOS: new widgets: Tonight's Meal (small, medium, Lock Screen), Use Soon (small, medium, Lock Screen) and Shopping List (small and Lock Screen). Tonight's Meal shows the planned recipe with its servings and pantry readiness and opens the week plan; Use Soon uses the same "expiring soon" window as the Pantry and reminders. A finished cook timer also banners with sound while the app is open.
- Web cooking: amounts that differ only by unit-conversion rounding now count as the whole pantry item. Cooking 453 g or 454 g from a 1 lb pack, or 240 ml from a cup, uses it up (and counts it as used if it was dated), instead of leaving 0.0013 lb behind or asking for 0.4 g more on the shopping list. The tolerance is 2% of the pantry item and applies only when the recipe and pantry units differ; same-unit amounts stay exact. Covered by new SQLite cooking and expiry tests.
- Web cooking: when a soon-expiring batch is in a unit the recipe can't be compared with (a bunch of cilantro against a recipe in grams), and later or undated stock is used instead, the cook preview now shows a check asking to use the expiring batch and adjust by hand.
- iOS: the cooking planner (`CookingPlanner.swift`) gets the same 2% conversion tolerance and passed-over expiring-batch check as the web, so the two apps agree. Covered by new `CookingPlannerTests`.
- Web: the **Use it up** filter on What can I cook? works out "today" from the time-zone preference, like the used/thrown-away tally, falling back to the browser's zone.
- Tests: a planned meal cooked at twice the recipe deducts and shops exactly what its preview showed; stock is used soonest-expiring first, including batches already past their date, which cooking still counts as used.

## 1.0.3 — Meal planning, expiry reminders, and security fixes

- Version numbers now match the iOS app. The web app moves from 0.9.0 to 1.0.3 to line up with Sous Chef for iOS 1.0.3; there are no 1.0.0–1.0.2 web releases.
- Security: Next.js 16.3.8, Auth.js core 0.41.3 and Convex Auth 0.0.96, with refreshed dependencies. `pnpm audit` reports no known advisories (previously 88, including 4 critical).
- Community password reset no longer writes reset links or email addresses to the logs. Without email delivery configured, community reset is unavailable instead.
- Weekly meal planning: a Plan page puts recipes on a day and meal with servings and a note, showing each meal's pantry readiness. Add recipes from the plan or from a recipe's "Add to plan".
- "Add week's shortages to list" combines what the week's uncooked meals need across recipes (converting units), counts the pantry once for the whole week, and tops up existing shopping list items instead of duplicating them.
- Cooking a planned meal uses the usual cook flow and atomic pantry deduction, scaled to the planned servings, and marks the meal cooked.
- Expiry reminders: "expiring soon" means in-stock items expiring within a window you choose (3 days by default), including anything already past its date.
- Inventory shows a "Use it up" card, and What can I cook? gains a **Use it up** filter that ranks recipes by how many expiring items they use and shows which ones.
- Removing an expired item asks whether it was used up or thrown away; the inventory shows this month's totals.

## iOS 1.0.3 — Security update

- Your Sous Chef server sign-in is only sent to your server. Recipe photos
  linked from other websites are downloaded without it, and requests that
  carry it can't be redirected to another address.
- Connecting over plain HTTP to a server outside your home network, including
  by IPv6 address, always asks for confirmation first, and the app refuses to
  send your password to such a server until you confirm.
- Recipe imports and synced photos stop downloading once they pass their size
  limit, and oversized images are refused before they're decoded.

## 0.9.0 — A livelier, clearer kitchen

- New design language across the app: grouped cards, section labels, inline expanding menus instead of dropdowns, and a shared UI kit (`src/components/ui/kit.tsx`).
- Smooth motion: page transitions, animated modals and menus, press feedback, staggered lists, skeleton loading, and a sliding sidebar highlight. Respects reduced-motion settings.
- Faster navigation: main pages prefetch their data in the background; a progress bar appears only for slow page loads.
- Redesigned Add/Edit item: inline location, unit, category, and calendar drawers with expiry shortcuts; scan or look up barcodes inside the form.
- Redesigned recipe editor: add ingredients from your pantry first, or create new ones inline, tracked at zero stock and optionally added to the shopping list. Stocking a purchase fills that placeholder instead of duplicating it.
- Redesigned recipe page with a readiness bar and a nutrition panel estimated from pantry items, listing which ingredients couldn't be counted and why.
- Pantry items can store nutrition per 100 g; barcode nutrition from Open Food Facts is now read correctly.
- Units read naturally with amounts ("2 cups", "½ cup"); recipe visibility controls removed.
- Shopping items support notes; "What can I cook?" gains a readiness filter.

## 0.8.0 — SQLite kitchens and optional community (not yet published)

- Private kitchens now run on local SQLite with local sessions, photos, and encrypted keys.
- One-container self-hosting; no Convex account or setup service required.
- Optional separate Convex community with recipe snapshots, search, imports, and public downloads.
- Isolated demo kitchens and a public recipe browser.
- Offline Convex export migration, consistent backups, and operator recovery.
- Updated Docker, deployment, development, and contributor documentation.
- System & Updates settings with installed version/build, stable-release checks, release notes, and administrator notifications.
- Opt-in managed Docker updates and portable Linux packages with backup, restart verification, and database-aware rollback.
- Release packaging excludes private kitchen data and local environment files.

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
