# Run Sous Chef at home

## New installation

1. Install Docker with Compose v2.
2. Clone this repository and run `./homelab.sh up`.
3. Open `http://YOUR-SERVER:3000` and create an account.

The helper creates `.env.homelab` if absent. It does not overwrite existing
settings. The app initializes SQLite and the units catalog itself. The first
registered local user is the instance administrator. Other users can register
and be added to a household by its owner/admin.

Set `SOUS_CHEF_ALLOW_SIGNUP=false` after creating the accounts you need to close
registration. The first account remains creatable on an empty database.

Only port 3000 is required. Phones access the web server, never the SQLite file.
There is no local Convex container, dashboard, keygen sidecar, or setup job.
The named `kitchen-data` volume contains the database, photos, and encryption key.

## Configuration

Edit `.env.homelab`, then run `./homelab.sh up`:

```dotenv
APP_PORT=3000
APP_URL=https://kitchen.example.com
SOUS_CHEF_ALLOW_SIGNUP=true
# Optional shared community:
# COMMUNITY_API_URL=https://your-deployment.convex.site
# COMMUNITY_CONVEX_URL=https://your-deployment.convex.cloud
```

`APP_URL` must match the browser-facing origin behind a proxy. For plain LAN
access without a proxy it can remain unset. Use HTTPS when exposing the app
outside your LAN; camera scanning also requires a trusted secure context.
See [HTTPS setup](HTTPS_SETUP.md).

Optional `RESEND_API_KEY` and `SMTP_FROM` enable reset emails; email also needs
`APP_URL`. Without email, use `./homelab.sh reset-password EMAIL` on the server.
The command prompts for the new password without displaying it.

## Operate

```sh
./homelab.sh status
./homelab.sh logs
./homelab.sh backup
./homelab.sh down
# After reviewing and pulling the release you want:
./homelab.sh update
```

`update` rebuilds this checkout and restarts the app; it does not pull or merge
Git branches. Back up before upgrading. Never run `docker compose down -v`
unless you intend to delete the kitchen volume.

Direct Compose is also supported:

```sh
cp .env.example .env
# Review .env before starting.
docker compose up -d --build
```

To use a published image, set `SOUS_CHEF_IMAGE` to an explicit release tag, then
run `docker compose pull app && docker compose up -d --no-build app`.
Image publication is separate from a source checkout; use a tag that exists.

## Existing Convex installations

Do not reuse the old frontend against a community-only Convex deployment.
First export the old kitchen, migrate it into SQLite, and verify the new app.
Follow [SQLite migration](docs/SQLITE_MIGRATION.md). Old Convex volumes are not
removed automatically. Preserve them and their keys until restoration is verified.

## Hosting the demo

Run a separate instance with `SOUS_CHEF_DEMO=true`, persistent storage, and its
own `APP_URL`. Each visitor gets a private sample kitchen. Configure the same
community URLs used by local installations to connect the demo to recipe
sharing. See [community operations](docs/COMMUNITY.md) before public launch.
