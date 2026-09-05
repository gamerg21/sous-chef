# Docker runtime

Use [DEPLOYMENT.md](DEPLOYMENT.md) for the home-server walkthrough. This page is the reference for the images and Compose files.

## Images

One Dockerfile produces two images:

| Target | Image | Purpose |
| --- | --- | --- |
| `runner` (default) | `sous-chef` | Next.js standalone web app on port 3000, non-root, reads its public Convex URL at runtime |
| `setup` | `sous-chef-setup` | One-shot job: deploys functions, sets `SITE_URL`, creates missing Convex Auth and encryption keys, copies optional email settings, seeds units. Also runs `backup`. Never serves traffic |

Neither image embeds deployment credentials. The GitHub workflow publishes both for amd64 and arm64 as `ghcr.io/<owner>/sous-chef` and `ghcr.io/<owner>/sous-chef-setup`; set `SOUS_CHEF_IMAGE` and `SOUS_CHEF_SETUP_IMAGE` in `.env.homelab` (or `.env` for the cloud file) to use pinned tags instead of building.

## Compose files

- `docker-compose.homelab.yml` (via `./homelab.sh`): Convex backend, keygen sidecar, setup job, web app, optional dashboard profile. Fully self-contained.
- `docker-compose.convex.yml`: web app only, plus a `setup` profile that configures a Convex Cloud deployment from `CONVEX_DEPLOY_KEY`.

## Settings

| Setting | Where | Meaning |
| --- | --- | --- |
| `SERVER_HOST` | `.env.homelab` | LAN IP or hostname devices use; derives every browser-facing URL |
| `APP_URL`, `CONVEX_PUBLIC_URL`, `CONVEX_SITE_URL` | `.env.homelab` | Explicit browser-facing origins behind a reverse proxy |
| `APP_PORT`, `CONVEX_PORT`, `CONVEX_SITE_PORT`, `DASHBOARD_PORT` | `.env.homelab` / `.env` | Host ports; defaults 3000, 3210, 3211, 6791 |
| `CONVEX_BACKEND_TAG` | `.env.homelab` | Pin the backend and dashboard images to one release |
| `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_URL` | `.env` (cloud) / web runtime | Browser-reachable Convex API origin |
| `CONVEX_DEPLOY_KEY` | setup job only (cloud) | Selects the cloud deployment to configure; never in the web container |
| `CONVEX_SELF_HOSTED_URL`, `CONVEX_SELF_HOSTED_ADMIN_KEY_FILE` | setup job (homelab) | Internal backend address and the keygen sidecar's admin key file |
| `SITE_URL` | setup job → Convex deployment | Exact public app origin, including scheme and port |
| `JWT_PRIVATE_KEY`, `JWKS`, `SECRETS_ENCRYPTION_KEY` | Convex deployment | Generated once by the setup job when missing |
| `RESEND_API_KEY`, `SMTP_FROM` | `.env` → Convex deployment | Optional password-reset email delivery |
| `BACKUP_DIR` | `.env` | Host directory for `backup` exports; default `./backups` |

The web container speaks HTTP; use a reverse proxy for HTTPS. `/api/config` exposes only the public backend URL and disables caching. `/api/health` returns 503 for a missing/invalid URL and 200 when the web process is configured. Neither endpoint reports backend connectivity or exposes secrets.
