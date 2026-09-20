# Migrate a Convex kitchen to SQLite

The migration tool is offline: it reads an export ZIP and writes a **new** data
directory. It never pushes to Convex or overwrites a local kitchen.

1. Identify the exact old deployment. Stop kitchen writes during the final export.
2. Export its tables **and files**:

   ```sh
   pnpm exec convex export --deployment EXACT-NAME --include-file-storage --path ./backups/kitchen.zip
   ```

3. Preserve the old deployment's encryption key if it has encrypted AI/integration
   credentials. Supply it as `SECRETS_ENCRYPTION_KEY` to the migration process;
   never print it or commit it. Auth signing keys stay with the community service.
4. Import into a new directory:

   ```sh
   pnpm migrate:sqlite ./backups/kitchen.zip ./migrated-data
   ```

5. Inspect `migration-report.json`, then start a separate app:

   ```sh
   SOUS_CHEF_DATA_DIR=./migrated-data pnpm dev
   ```

6. Verify account access, household membership, counts, recipes, photos, unit
   conversion, and backup restoration before switching the normal data directory.

Compatible Convex Auth password hashes are imported and upgraded after a successful
local login. Existing cloud sessions are not imported. Unsupported credentials
require the local operator recovery command. IDs are remapped with table prefixes,
including references. Recipe photos included in the export are copied locally.

An old recipe's public/unlisted flag does **not** publish it to the new community.
Community publications are separate snapshots and require explicit publication.

The community backend no longer includes private kitchen tables. Do not deploy
that schema over a populated old kitchen before exporting and migrating it. To
reshape an existing deployment, preserve auth tables/keys, migrate any public
recipes into `hubRecipes`, verify counts, then remove legacy kitchen data/functions.

The September 2026 transition of `graceful-hummingbird-993` found zero recipes
and zero uploaded files. The local transition report records the backup and
verification results; these are evidence for that deployment, not a general
promise that every migration has no recipes to transfer.
