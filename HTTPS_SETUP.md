# HTTPS setup

Sous Chef serves HTTP on port 3000. Put Caddy, nginx, or another trusted reverse
proxy in front of it for HTTPS. Set `APP_URL=https://kitchen.example.com` to the
exact browser-facing origin and restart the app. Cookies become secure when the
configured app origin uses HTTPS; browser writes validate the origin.

Only the web port needs proxying. SQLite stays on the server's local disk, and
there is no Convex port to expose for private kitchens. Optional community URLs
point to the separately managed HTTPS service.

Camera barcode scanning needs a secure context trusted by the phone/browser.
A self-signed certificate must be trusted on each device; simply using an https
URL does not establish trust. For local development, `pnpm dev:https` uses the
existing local certificate helper. See [deployment](DEPLOYMENT.md).
