# Run Sous Chef at home

Sous Chef is a web app backed by Convex. You can run **everything on your own hardware** with one command, or run only the web app at home and keep the backend on Convex Cloud. Both use the same application and the same one-shot setup job.

## Option A: everything on your server (recommended)

Requirements: a Linux box, NAS, Raspberry Pi 4/5, or mini PC with Docker Engine and Compose v2 installed, on the same network as your phones. No Convex account is needed.

```sh
git clone https://github.com/gamerg21/sous-chef.git
cd sous-chef
./homelab.sh up
```

The first run creates `.env.homelab`, fills `SERVER_HOST` with the machine's detected LAN address, builds the images, starts everything, and prints the URLs. Open `http://SERVER_HOST:3000`, create the first account, and you are the first household. If the detected address is not the one other devices use, edit `SERVER_HOST` in `.env.homelab` and run `./homelab.sh up` again.

What the command does, in order:

1. Starts the open-source Convex backend with a persistent data volume. The backend generates and stores its own instance secret; you never handle it.
2. Runs a keygen sidecar that derives the admin key from that secret and passes it to the setup job through a private volume.
3. Runs the setup job: deploys this checkout's Convex functions, sets `SITE_URL`, creates the Convex Auth signing keys and the secrets encryption key if they do not exist yet, copies optional email settings, and seeds the units catalog. Rerunning it is safe; existing keys are never overwritten.
4. Starts the web app, which receives the public backend URL at runtime and never sees an admin key.

Everyday commands:

```sh
./homelab.sh update                 # git pull, rebuild, restart; setup reruns idempotently
./homelab.sh status                 # container health
./homelab.sh logs app               # or backend, setup
./homelab.sh backup                 # export data + uploaded files into ./backups
./homelab.sh admin-key              # Convex dashboard/CLI admin key (keep private)
./homelab.sh up --profile dashboard # also run the Convex dashboard on port 6791
./homelab.sh down                   # stop containers; data volumes remain
```

Ports: 3000 (app), 3210 (Convex API), 3211 (Convex HTTP actions, used by sign-in), 6791 (optional dashboard). All are configurable in `.env.homelab`. Browsers and phones must reach 3000, 3210, and 3211 at `SERVER_HOST`.

Prebuilt images: set `SOUS_CHEF_IMAGE` and `SOUS_CHEF_SETUP_IMAGE` in `.env.homelab` to pinned tags published by the [Docker workflow](.github/workflows/docker-build.yml) (`ghcr.io/gamerg21/sous-chef` and `ghcr.io/gamerg21/sous-chef-setup`) to skip building on a slow machine. Pin `CONVEX_BACKEND_TAG` to a [backend release](https://github.com/get-convex/convex-backend/releases) once things work, so upgrades happen when you choose. Upgrade the backend and dashboard together and take a backup first.

## Option B: Convex Cloud backend, web app at home

Use this when you would rather not run a database at home. Convex's free tier comfortably fits a household.

1. Create a project at [dashboard.convex.dev](https://dashboard.convex.dev) and generate a **production deploy key** (Settings → Deploy keys). Note the deployment URL, `https://<name>.convex.cloud`.
2. In this checkout:

   ```sh
   cp .env.example .env
   # Set NEXT_PUBLIC_CONVEX_URL to the deployment URL and SITE_URL to http://SERVER_HOST:3000
   CONVEX_DEPLOY_KEY='prod:...' docker compose -f docker-compose.convex.yml --profile setup run --rm setup
   docker compose -f docker-compose.convex.yml up -d --build
   ```

   The setup job performs the same steps as Option A against your cloud deployment. The deploy key is used only by that one-off container; never put it in the web container's environment.

3. Open `http://SERVER_HOST:3000`.

For updates: pull, rerun the setup job (it redeploys functions), then `up -d --build`.

## Use it from your phone with HTTPS

Everything works over plain HTTP on your LAN except camera barcode scanning, which browsers only allow in a secure context. Put Caddy, nginx, or Traefik in front and give each origin a name:

| Origin | Forwards to | `.env.homelab` value |
| --- | --- | --- |
| `https://kitchen.example.com` | `http://localhost:3000` | `APP_URL` |
| `https://convex.kitchen.example.com` | `http://localhost:3210` | `CONVEX_PUBLIC_URL` |
| `https://convex-site.kitchen.example.com` | `http://localhost:3211` | `CONVEX_SITE_URL` |

Set those three values in `.env.homelab` and run `./homelab.sh up` again: the backend restarts with the new origins and the setup job updates `SITE_URL`. A real domain with a DNS-challenge certificate keeps everything inside your network. A private CA works too, but every phone must trust it. Self-signed warnings are not an onboarding strategy.

## Backups and keys

`./homelab.sh backup` exports every table and uploaded file into `BACKUP_DIR` (default `./backups`), running the job as your user so the files are yours. The export does not contain the Convex Auth signing keys, the secrets encryption key, or the backend's instance secret. Those live in the `convex-data` volume and the backend's environment; keep `./homelab.sh admin-key` output and a copy of the volume somewhere safe. Losing the encryption key makes stored AI provider keys unreadable; losing the signing keys signs everyone out. See [backup and restore](docs/BACKUP.md).

## Troubleshooting

- **Setup screen in the browser:** the web app has no valid backend URL. Check `SERVER_HOST` in `.env.homelab` and recreate with `./homelab.sh up`.
- **Sign-in fails but the app loads:** the browser cannot reach port 3211, or `SITE_URL` differs from the address in the browser. `./homelab.sh logs setup` shows the configured values.
- **Setup job exits early:** `./homelab.sh logs setup` explains which step failed. The backend must answer `http://SERVER_HOST:3210/version`.
- **Phone cannot connect:** phones use `SERVER_HOST`, never `localhost`. Check the firewall for ports 3000, 3210, and 3211.

Container health reports web/config readiness, not backend/auth/email health.
