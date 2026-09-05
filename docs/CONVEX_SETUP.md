# Connect your kitchen to Convex

Sous Chef uses Convex for data, files, authentication, and realtime subscriptions. Keep Convex Cloud or run the open-source Convex backend yourself. AI keys and email are optional; inventory, recipes, cooking, and shopping work without them.

## Easiest first run: Convex Cloud + local web app

Use Node.js 22 and the pinned pnpm version (`corepack enable`). From a checkout:

```sh
pnpm install
pnpm exec convex dev --once
pnpm exec auth --web-server-url http://localhost:3000
pnpm exec convex dev --once
pnpm seed:units
pnpm run doctor
pnpm dev
```

The first Convex command asks you to select/create a project and writes `.env.local`. The Auth command configures `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` **on that deployment**. Auth source files are already implemented in this repository; retain them when the CLI shows code suggestions. Keep existing signing keys on an existing deployment.

For repeatable new cloud setups, `pnpm run setup:backend` combines the backend initialization, Auth initializer, deployment, and units seed steps above. It remains interactive so you choose your own project and app URL.

Open `http://localhost:3000`, create an account, and sign in. Sous Chef creates a kitchen with Pantry, Fridge, Freezer, and a shopping list. Add a few ingredients, save a recipe, and open **What can I cook?**. Household settings let you add another registered user. Switching kitchens changes the default data scope across the app.

`pnpm dev` starts both Next.js and the Convex watcher. Do not run a second backend watcher. If a watcher is already running, use `pnpm dev:frontend` instead. For another port, use `pnpm dev:frontend --port 3100` and update `SITE_URL` on Convex to `http://localhost:3100`.

## A permanent home server

1. Configure a dedicated production Convex deployment, including Auth keys:

   ```sh
   pnpm exec auth --prod --web-server-url https://kitchen.example.com
   pnpm exec convex deploy
   pnpm exec convex run --prod units:seed
   ```

2. Put that deployment's public API URL in the web server's `.env` as `NEXT_PUBLIC_CONVEX_URL`. See [Docker deployment](../DEPLOYMENT.md).
3. Use the same public app origin for Convex `SITE_URL` and the browser. If an older installation has `APP_BASE_URL`, update it too: that legacy override takes precedence.
4. Confirm signup, signin, and recovery from the actual phone/desktop origin before inviting household members.

Deploy keys are operator/CI credentials. The web container only needs the public API URL. Putting backend secrets in Docker's environment does **not** configure the Convex deployment.

## Fully self-hosted Convex

Follow the [official Convex self-hosting guide](https://docs.convex.dev/self-hosting) and [backend Docker instructions](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md) to run and persist the backend and generate its admin key. Keep the dashboard/admin credentials private.

Configure the operator's CLI environment with `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` as described there; remove conflicting cloud deployment selections. Deploy this repository's functions to that backend with `pnpm exec convex deploy`. For Auth, the installed initializer accepts `--url` and `--admin-key`:

```sh
pnpm exec auth --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY" --web-server-url https://kitchen.example.com
pnpm exec convex deploy
pnpm exec convex run units:seed
```

Use your browser-reachable backend API origin for the web app's `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL`. A Docker service name such as `http://backend:3210` is not reachable from a phone. A phone's `localhost` is the phone itself. Configure Convex's API and HTTP action origins per the official guide; Auth's issuer/JWKS endpoint must be reachable too.

This repository does not bundle or automatically upgrade the Convex backend. Back up its database, storage, and configuration before upgrades. Self-hosted infrastructure needs its own TLS, persistence, and recovery verification.

## Password recovery

With email enabled, set these **on Convex** (add `--prod` when configuring production):

```sh
pnpm exec convex env set RESEND_API_KEY 'your-resend-key'
pnpm exec convex env set SMTP_FROM 'Kitchen <kitchen@your-verified-domain.com>'
```

Use a sender/domain verified in Resend. A made-up `.local` address will not deliver email. Test a real reset end to end.

Without email, the recovery page clearly identifies operator-assisted recovery. Request a link, then the trusted operator reads it from `pnpm exec convex logs` and privately shares it with the account owner. The owner enters their own new password. Reset links are credentials: do not publish logs or paste links into issues. The existing CLI-only password-hash helper is a last-resort operator tool, not a public API.

If recovery says it succeeded but nothing arrives, first check the delivery mode. If links go to the wrong app, check `SITE_URL` and any `APP_BASE_URL` override on Convex, including scheme and port.

## Optional AI configuration

To store provider keys, generate a 32-byte encryption key (`openssl rand -base64 32`) and set it as `SECRETS_ENCRYPTION_KEY` on Convex. Back it up securely: replacing it makes stored credentials unreadable. Provider configuration/testing exists; an end-user AI assistant is still roadmap work.

## Troubleshooting

- **Setup screen:** missing/invalid public backend URL. Set the web server environment and restart it.
- **Connecting/loading:** run `pnpm run doctor`, inspect browser connectivity, and confirm backend functions are deployed.
- **Auth fails:** check Auth keys, HTTP routes, and matching `SITE_URL`; run `pnpm exec auth` for missing configuration without overwriting existing keys.
- **Units missing:** run `pnpm seed:units` against the intended deployment.
- **Camera unavailable on a phone:** use trusted HTTPS on the app. Manual item entry still works without camera access.

`pnpm run doctor` checks local configuration and endpoint reachability, not account access or email delivery. `/api/health` checks the web process and URL configuration only.
