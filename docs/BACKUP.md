# Back up and restore a home instance

The web container does not contain your kitchen database. Convex holds tables, users, recipes, inventory, and uploaded photos. Recipe JSON export alone cannot restore an instance.

## Export a snapshot

From the configured checkout with dependencies installed:

```sh
pnpm run backup --deployment dev
```

Choose `prod`, `local`, or a specific deployment name explicitly when appropriate. There is no implicit production target. The wrapper runs the installed Convex CLI's export with `--include-file-storage` and writes a timestamped ZIP into `.backups/`. The directory is ignored by Git and the files use private permissions on systems that support them.

Treat the archive as sensitive: it includes authentication records and encrypted provider credentials. Copy it to protected storage away from the home server. Keep at least one previous successful backup. A failed export is not a valid backup.

Separately retain your Convex deployment environment configuration in a password manager or encrypted backup, especially `JWT_PRIVATE_KEY`, `JWKS`, `SECRETS_ENCRYPTION_KEY`, email credentials, and deployment access credentials. Snapshot export does not back these up. Preserve the application revision and deployment configuration too.

## Rehearse recovery in a disposable deployment

1. Create a separate empty Convex deployment and deploy the same application revision/schema to it. Do not point the live frontend at it yet.
2. Import the snapshot into that explicit deployment:

   ```sh
   pnpm exec convex import --deployment YOUR_DISPOSABLE_DEPLOYMENT .backups/YOUR_SNAPSHOT.zip
   ```

   Review the CLI prompt carefully. Do not use `--replace-all` or skip confirmations against your live kitchen.
3. Restore the required environment configuration securely. Set `SITE_URL` and any `APP_BASE_URL` override to the recovery frontend's URL; preserve the encryption key needed to read stored secrets.
4. Run a separate frontend configured with the recovery deployment URL. Verify login/recovery, household membership, inventory counts, recipe ingredients/steps, and uploaded photos. Reconnect clients after a restore; old sessions may need fresh sign-in.
5. Verify an optional saved provider key can still be decrypted before relying on the backup for AI settings recovery.

This repository includes the export wrapper, not an automatic restore or scheduled backup service. An actual snapshot/restore drill and storage-provider retention checks remain deployment acceptance tasks.
