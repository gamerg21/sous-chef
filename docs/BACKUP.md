# Backup and recovery

## Create a consistent backup

Home server:

```sh
./homelab.sh backup
```

This runs SQLite's online backup API inside the app and copies the result to
`backups/TIMESTAMP/` on the host. It includes the database (including photos,
accounts, sessions, and community connections), encryption key, and a manifest.

Development checkout:

```sh
pnpm run backup
# Optional destination, which must not already contain a backup:
pnpm run backup ./backups/before-upgrade
```

Backups are private. Keep an encrypted off-machine copy. Preserve any external
`SECRETS_ENCRYPTION_KEY` override; the backup command writes its effective value
into the protected backup directory. Runtime email settings and public URLs are
not database records; preserve your environment configuration separately.

## Verify a restore without overwriting the current kitchen

```sh
SOUS_CHEF_DATA_DIR=/absolute/path/to/backups/TIMESTAMP \
  node scripts/local-admin.mjs restore-copy /absolute/path/to/new-restored-data
SOUS_CHEF_DATA_DIR=/absolute/path/to/new-restored-data pnpm dev
```

Use a separate port if another app is running. Sign in, inspect recipes/photos,
and exercise a cooking/shopping operation. Check `PRAGMA integrity_check` if
investigating corruption. A backup file existing is not proof of restoration.

For Docker recovery, stop the app, create a **new** volume or empty bind directory,
copy `kitchen.sqlite` and `secrets.key` from the backup, set ownership to 1001:1001,
and point the app at it. Do not copy old WAL/SHM files into the new directory.
Retain the old volume until the restored kitchen is verified.

## Recover a password

```sh
./homelab.sh reset-password person@example.com
```

For a checkout, pipe the new password from a hidden prompt into:
`pnpm reset-password person@example.com`. Do not put passwords in arguments or
shell history. This replaces the local password and revokes local sessions and
reset links. It does not change the separate community account.
