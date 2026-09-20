# SQLite transition verification

The private kitchen now runs inside Next.js using SQLite. Convex is optional for
local operation and stores community accounts, publisher tokens, recipe snapshots,
and rate limits. See [Docker](../DOCKER.md), [migration](SQLITE_MIGRATION.md), and
[community/demo setup](COMMUNITY.md) for operating instructions.

## Existing installation

The configured development deployment `graceful-hummingbird-993` was backed up,
updated, and pruned to community/auth tables. Its original users, auth accounts,
sessions, refresh tokens, verifiers, verification codes, and auth rate-limit
records were compared against the final export and remained unchanged.

The previous kitchen was imported into local `data/kitchen.sqlite`, including its
one user, household, memberships, preferences, shopping list, and unit data. There
were no recipes, inventory items, or uploaded files in the source deployment.
The original password hash was preserved; compatibility was tested with synthetic
Lucia credentials. The user's actual password was not requested or tested.

Private recovery snapshots and migration copies are in
`.backups/sqlite-transition/` (ignored by Git and Docker). Preserve those backups
until the migrated installation has been accepted. No credentials belong in Git.

## Acceptance evidence

- Unit/integration coverage includes household isolation, roles, cooking and stock
  deduction, unit conversions, SQLite rollback/serialization, local authentication,
  imported password hashes, demo cleanup, photo authorization, and cloud publishing.
- Type checking, production build, lint (warnings only), documentation links, and
  Compose configuration validation passed.
- Browser verification covered the demo pantry, cooking confirmation, and separate
  community connection screen. A development hydration warning was traced to
  Grammarly-added body attributes.
- Live community acceptance published a temporary unlisted snapshot, checked
  idempotent retries, downloaded/imported it into SQLite, published from the local
  app, and unpublished while retaining the local copy. Test publications and
  publisher tokens were removed afterward.
- Local API checks covered authentication, CSRF rejection, cooking, image access,
  and recipe export/import. Online backup and restore passed SQLite integrity and
  record-count checks.

## Remaining deployment work

The Docker image was subsequently built and started locally. Its health check,
persistent SQLite data across restart, and in-container backup passed.
Email delivery was not tested.
The public web demo has not been deployed; it needs a domain and a host with a
persistent disk. Community moderation, comments, likes, and paginated feeds remain
future work as described in [community setup](COMMUNITY.md).
