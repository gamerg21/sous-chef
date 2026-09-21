# Versions and updates

Open **Settings → System & Updates** from your account menu. The app shows its
installed version/build, release notes, and the last check result. Version 0.8.0
is the current development baseline; changing package.json does not publish a
release. Only the instance administrator can check manually or install updates.
Other signed-in users can see version information. Demo users cannot update.

Checks contact the public GitHub releases API, without kitchen data or credentials.
Results are cached for six hours; failed checks retry after five minutes. Manual
checks have a one-minute cooldown. The app checks while in use, not while stopped.
Offline kitchens continue to work. Only stable vX.Y.Z releases trigger alerts;
`latest` Docker builds from main are not stable release announcements.

## Managed Docker updates (Linux host)

Existing containers need a one-time setup. Use Node.js 22.18+ and Docker CLI on
the Docker host. The updater runs separately from the app and needs Docker access.
It supports a local Unix socket, persistent `/data`, and ordinary bridge/host or
named Docker networks with dynamic addresses. Ephemeral published ports, static IPs and container-shared
network namespaces require manual updates. This is intended for a single app
container, not Kubernetes, Swarm, or an independently managed GitOps deployment.

Keep a trusted copy of `scripts/updater.mjs` and `scripts/update/` from this release
on the host (these are also included in portable release downloads).
Create private updater storage and a separate IPC directory writable by the app
UID and your updater user's group. Mount only the IPC directory into the app:

```sh
sudo install -d -m 700 -o "$(id -u)" -g "$(id -g)" /var/lib/sous-chef-updates
sudo install -d -m 2770 -o 1001 -g "$(id -g)" /var/lib/sous-chef-updates/ipc
```

Recreate the existing container with its original data volume, environment and
ports, adding these options to `docker run`:

```sh
--mount type=bind,src=/var/lib/sous-chef-updates/ipc,dst=/updates \
-e SOUS_CHEF_UPDATE_DIR=/updates
```

For Compose, add that bind mount and environment variable to the app service.
Start the updater as the trusted host user who has Docker access:

```sh
node scripts/updater.mjs --docker sous-chef \
  --state /var/lib/sous-chef-updates --url http://127.0.0.1:3000
```

Use your actual container name and directly reachable app port. Run this command
under your host's service manager so it survives logout and restarts on boot.
Do not expose the Docker socket or mount it in the web app. No updater TCP port
is opened; the app submits a version-only request through `/updates`.

Once connected, **Update to X** appears when a newer stable release is available.
The updater pulls the official image, verifies its version label, pins its digest,
stops the app, copies the complete `/data` directory, and recreates the container
with its environment, ports, mounts, restart policy and network aliases. On success,
the prior container stays stopped with a `-previous-` suffix. Backups and original
container configuration are retained under the private updater directory, outside
the app-mounted IPC directory. They contain
credentials: restrict host access and move backups to secure storage as needed.

The updater controls this container after setup. If you later run Compose again,
set `SOUS_CHEF_IMAGE` to the installed release's image digest first; otherwise your
Compose file could replace it with a different image. Do not run another automatic
container updater against the same instance.

## Portable non-Docker installation

Stable releases build Linux x64 and arm64 `.tar.gz` packages. Each contains the
standalone app, a bundled Node executable, and the updater supervisor. This is a
portable directory, not a single-file executable. Windows/macOS portable packages
are not currently published; use Docker there.

Download the appropriate archive from the official GitHub release, extract it to
a permanent local directory, and run:

```sh
cd sous-chef
./start.sh
```

No separate Node installation is needed. The supervisor starts the app, retains
kitchen data in `./data`, and enables in-app updates. Set `PORT`, `APP_URL`, and
other environment settings before starting as needed; use `HOSTNAME_BIND` to change
the default `0.0.0.0` binding. Run `start.sh` under a service manager for boot startup.
Do not also launch `app/server.js`: only one app process may access the database.

Updates download the official platform asset, verify its SHA-256 against GitHub's
release asset metadata, extract to a new directory, stop the app, back up the data,
and switch the `current` symlink. The downloaded app runs using its bundled Node.
The original supervisor remains installed; supervisor upgrades may require a
manual package refresh. Keep the original installation and `releases/` directories.

## Recovery and limitations

Writes are blocked during backup, startup verification and rollback. The Settings
page reconnects automatically after the restart; reload it to load new browser
assets. Other household members briefly lose access. Finish edits before updating.

Both adapters verify `/api/health` and the exact `/api/version`. If startup fails,
they restore the previous database snapshot and executable/image before restarting.
The app remains in maintenance until recovery finishes. Backups include SQLite WAL
files from the stopped app and its encryption key/configuration. Application changes
must retain this update/maintenance protocol for safe automatic rollback.

If the updater or host is killed mid-update, automatic crash recovery is not
attempted. Inspect the stopped containers/current symlink and retained backups
before restarting. A stale `service.lock` must only be removed after confirming
no updater process remains. An interrupted operation stays in maintenance with a recovery-required status.
After verifying/restoring the kitchen, stop the updater, remove its `status.json`
and `ipc/request.json` files, and restart it. Use [backup recovery](BACKUP.md) if the
app cannot start. Never delete a volume.

Disk space must accommodate the new package/image and a full backup. Backup/download
failure aborts the update; backups are never pruned automatically. Custom source
changes are not merged into official releases. For a source checkout, review and
pull the desired release and follow [deployment instructions](../DEPLOYMENT.md).
For unmanaged Docker, follow [manual update instructions](../DOCKER.md).

## Publishing a release

Set package.json to the intended semver (currently `0.8.0`), validate the change,
then push the matching `vX.Y.Z` tag as an explicit release operation. The workflow
rejects mismatched tags, builds Docker amd64/arm64 and portable Linux packages,
and publishes a GitHub release only after all packages are ready. Versioned Docker
images and portable assets must remain immutable once published. GitHub's release
metadata and HTTPS are the trust source; there is no separate offline signing key.
Source commits, image publication, release publication and deployed instances are
separate states. This implementation does not itself publish or deploy 0.8.0.
