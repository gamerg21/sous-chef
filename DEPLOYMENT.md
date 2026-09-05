# Run Sous Chef at home

Sous Chef is a web app backed by Convex. Choose Convex Cloud for less maintenance or self-host Convex using its official Docker distribution. Both use the same application.

## 1. Prepare Convex

Follow [the backend setup guide](docs/CONVEX_SETUP.md): deploy functions, initialize Convex Auth keys and `SITE_URL`, and seed units. A URL alone is not a configured backend.

## 2. Start the web app

From this repository's checkout:

```sh
cp .env.example .env
# Edit NEXT_PUBLIC_CONVEX_URL to your configured backend's public API URL.
docker compose -f docker-compose.convex.yml up -d --build
```

Open `http://localhost:3000`. From another device, use the server's hostname/IP. Set `APP_PORT` if port 3000 is occupied, and keep Convex's `SITE_URL` equal to the actual browser-facing origin. Never use the Convex `.site` HTTP-action URL in place of its API URL.

The Compose file builds this checkout, so you get the changes in your source instead of silently downloading an older published image. It runs the web app only; it does not launch or configure Convex. To use a trusted prebuilt image containing these changes, set `SOUS_CHEF_IMAGE` to its pinned tag, then use `docker compose -f docker-compose.convex.yml up -d --no-build` after pulling it.

The image reads the public backend URL at startup through `/api/config`. You can run the same image against another backend without rebuilding. Recreate the container after changing `.env`. No deploy key, email key, or AI key belongs in the web container.

## 3. Use it from your phone

Put Caddy, nginx, or Traefik in front of the app for trusted HTTPS. The container serves HTTP on port 3000; TLS terminates at the proxy. Camera barcode scanning needs a secure browser context. Self-signed browser warnings are not an onboarding strategy. The Docker image uses Next.js's standard standalone server; legacy `ENABLE_HTTPS`/certificate-mount options are no longer used by this image.

Make sure both the app and backend URLs are reachable from the phone. Test signup, adding inventory, creating a recipe, shopping-list changes, and password recovery. Realtime updates use Convex subscriptions; there is no separate SSE server to configure. Offline operation is not implemented.

## Operations

```sh
docker compose -f docker-compose.convex.yml ps
docker compose -f docker-compose.convex.yml logs -f app
# After reviewing/pulling source updates:
docker compose -f docker-compose.convex.yml up -d --build
# Stop the web app (does not delete Convex data):
docker compose -f docker-compose.convex.yml down
```

Container health reports web/config readiness, not backend/auth/email health. Back up Convex data and file storage using the process appropriate to your backend, and retain your Auth/encryption keys. Recipe JSON export is useful for portability but is not a full instance backup.
