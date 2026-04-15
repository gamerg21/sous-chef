# Docker Guide (Convex-First)

This guide focuses on Docker usage with the recommended Convex backend.

For quick end-user steps, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Recommended Docker File

Use:

- `docker-compose.convex.yml` (recommended)

It runs only the app container and expects Convex env configuration.

## Quick Start

```bash
cp .env.example .env
```

Set:

```env
NEXT_PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud"
APP_BASE_URL="http://localhost:3000"
APP_PORT=3000
```

Then run:

```bash
docker compose -f docker-compose.convex.yml up -d
docker compose -f docker-compose.convex.yml logs -f app
```

## HTTPS

- Set `ENABLE_HTTPS=true` for app-managed HTTPS with self-signed cert support.
- For public production domains, prefer reverse proxy SSL termination.

## Optional Convex Vars

- `CONVEX_DEPLOY_KEY`

