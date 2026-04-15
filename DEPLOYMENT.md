# Deployment Guide (Convex-First)

This is the recommended deployment flow for Sous Chef:

1. Use Convex as the backend
2. Run the app with Docker using `docker-compose.convex.yml`

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- A Convex deployment URL (`NEXT_PUBLIC_CONVEX_URL`)

If you do not have Convex configured yet, start here: **[docs/CONVEX_SETUP.md](./docs/CONVEX_SETUP.md)**.

## Quick Start

### 1. Create `.env`

```bash
cp .env.example .env
```

At minimum, set:

```env
NEXT_PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud"
APP_BASE_URL="http://localhost:3000"
APP_PORT=3000
```

Optional:

```env
CONVEX_DEPLOY_KEY="prod:your-deploy-key"
ENABLE_HTTPS=true
```

### 2. Start the app container

```bash
docker compose -f docker-compose.convex.yml up -d
```

### 3. Verify

```bash
docker compose -f docker-compose.convex.yml ps
docker compose -f docker-compose.convex.yml logs -f app
```

Open `http://localhost:3000` (or your configured `APP_PORT`).

## Updates

```bash
docker compose -f docker-compose.convex.yml pull
docker compose -f docker-compose.convex.yml up -d
```

## Stop

```bash
docker compose -f docker-compose.convex.yml down
```

## HTTPS Notes

- `ENABLE_HTTPS=true` enables app-managed HTTPS with self-signed cert support.
- For production with public domains, prefer reverse proxy SSL termination (nginx, Caddy, Traefik).


