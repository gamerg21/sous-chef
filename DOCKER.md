# Docker reference

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
