# Docker reference

## Install the published image

```sh
docker run -d --name sous-chef --restart unless-stopped \
  -p 3000:3000 -v sous-chef-data:/data \
  ghcr.io/gamerg21/sous-chef:latest
```

Open `http://localhost:3000` and create your local account. On a remote server,
use its hostname/IP. The same image supports Linux amd64 and arm64 (including
Apple Silicon through Docker Desktop and 64-bit Raspberry Pi).

For a hosted server behind an HTTPS reverse proxy, add
`-e APP_URL=https://kitchen.example.com` before the image name. Keep the proxy
on the same host and use `-p 127.0.0.1:3000:3000` to bind only to loopback.
Use a persistent disk; ephemeral/serverless filesystems cannot retain SQLite.

### Compose without cloning

```sh
curl -fsSL https://raw.githubusercontent.com/gamerg21/sous-chef/main/compose.image.yml -o compose.yml
docker compose up -d
```

This Compose file only pulls the published image. Optional settings go in a
local `.env` beside it. To update after making a backup:

```sh
docker compose pull
docker compose up -d
```

For a container created with `docker run`, keep the same named volume:

```sh
docker pull ghcr.io/gamerg21/sous-chef:latest
docker stop sous-chef
docker rm sous-chef
# Repeat the original docker run command, including any environment settings.
```

Removing the container preserves the named volume. See [backup instructions](docs/BACKUP.md)
before updating. `latest` tracks main; pin an image digest for reproducible
installs. Release tags are published when a matching `vX.Y.Z` Git tag is pushed.

## Build from source

The Dockerfile builds one `runner` image: Next.js standalone, Node.js 22.18,
non-root UID/GID 1001, port 3000, and SQLite. There is no setup image.

`docker-compose.yml` is the standard installation. `docker-compose.homelab.yml`
is the equivalent helper configuration. `docker-compose.convex.yml` is a
compatibility filename that includes the standard configuration; it no longer
runs or configures a Convex kitchen. That include requires Compose 2.20+.

| Setting | Purpose |
| --- | --- |
| `APP_PORT` | Host port; defaults to 3000 |
| `APP_URL` | Exact browser origin, particularly behind an HTTPS proxy |
| `SOUS_CHEF_DATA_DIR` | `/data` in Docker; `./data` in development |
| `SOUS_CHEF_ALLOW_SIGNUP` | Set false to close registration after initial setup |
| `SOUS_CHEF_DEMO` | Opt-in isolated demo kitchens, default false |
| `COMMUNITY_API_URL` | Optional community HTTP origin (`…convex.site`) |
| `COMMUNITY_CONVEX_URL` | Optional community account origin (`…convex.cloud`) |
| `RESEND_API_KEY`, `SMTP_FROM` | Optional local reset email |
| `SECRETS_ENCRYPTION_KEY` | Optional existing key override; otherwise generated |
| `SOUS_CHEF_IMAGE` | Prebuilt image tag; default builds locally |

The `kitchen-data` volume persists `/data/kitchen.sqlite` and `/data/secrets.key`.
Photos are SQLite blobs, so a SQLite backup includes them. SQLite's WAL/SHM files
are runtime state: do not copy only the main database while it is running.
Use the backup command in [BACKUP.md](docs/BACKUP.md).

If replacing the named volume with a host bind mount, create it with ownership
1001:1001. Keep SQLite on local disk. Run a single app process against a volume;
do not share the volume between replicas or hosts.

`/api/health` checks that the local database opens and can be read.
`/api/config` returns only public runtime settings; keys and tokens stay server-side.
The image reads settings at startup, so community URLs need no image rebuild.

The Docker workflow builds amd64/arm64 images. A build validates packaging;
a successful deployment and end-to-end acceptance are separate checks.
