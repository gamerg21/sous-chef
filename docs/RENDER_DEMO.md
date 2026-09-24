# Disposable demo on Render Free

This deployment runs the actual kitchen app with isolated visitor households.
It uses temporary SQLite storage and must never contain a personal kitchen.
No Convex deployment, AI key, email service, or custom domain is required.

## Deploy

Create a Render web service from this repository and the branch containing
`render.yaml`, using Docker and the **Free** instance plan. The Blueprint sets:

- `SOUS_CHEF_DEMO=true` and `SOUS_CHEF_ALLOW_SIGNUP=false`.
- A writable `/data` directory inside the container, without a paid disk.
- `/api/health` as the health check.
- `APP_URL` set explicitly to the assigned HTTPS origin, so secure cookies
  and origin checks use the correct address.
- A 384 MB Node heap limit at runtime, leaving the build unrestricted.
- Render native auto-deploy off; GitHub Actions controls deployment after CI.

Request a service name containing `souschef`, such as `souschef-demo`.
Render assigns an `onrender.com` address; use the actual address shown in the
service dashboard rather than assuming a name is available. If configuring
manually, copy the Docker command and environment values from `render.yaml`,
and set `APP_URL` to your assigned origin (without `/demo`).

The hosted demo is https://souschef-demo.onrender.com/demo, deployed from
`main` in the public `gamerg21/sous-chef` app repository. The old
`codex/render-demo` branch is historical and should no longer receive updates.
The marketing site links to this address through its
production `DEMO_URL` setting.

## Automatic updates

Push or merge app changes to `main`. The `Type Check` workflow runs TypeScript,
lint, tests, documentation checks, and a production build. When it succeeds,
`Deploy live demo` calls Render's deploy hook with that exact commit SHA.
An older run is skipped if `main` has advanced. Failed checks never deploy.
The workflow waits for `/api/health` to report the same revision and verifies
that demo mode is enabled; merely accepting the deploy request is not success.

This is separate from `Publish Docker images`, which publishes GHCR images for
self-hosters. Render builds its own Docker image from the tested source commit.
A version bump alone, an unpushed local change, a feature branch, or a change to
the private marketing repository does not update the demo.

### One-time setup

1. Configure Render service `souschef-demo` (`srv-daoj4kg473hc73ahds1g`) to use
   public repository `https://github.com/gamerg21/sous-chef`, branch `main`.
2. Keep Render Auto-Deploy **Off** so it cannot bypass CI. Keep the Free plan,
   existing demo environment, Docker command, and `/api/health` health check.
3. Copy the service's Settings → Deploy Hook into the public app repository's
   Actions secret named `RENDER_DEPLOY_HOOK_URL`. Never commit or log this URL;
   it grants deployment access to this one service. No full Render API key is needed.
4. Run **Type Check** manually on `main` in GitHub Actions to validate the setup
   and deploy the latest commit. The deploy workflow fails clearly if the secret
   is missing. A successful deploy summary includes the live version and revision.

### Check, retry, or roll back

- [GitHub Actions](https://github.com/gamerg21/sous-chef/actions) shows both
  validation and deployment. Failed workflows appear there; use GitHub's normal
  Actions notification settings for alerts.
- [Render dashboard](https://dashboard.render.com/web/srv-daoj4kg473hc73ahds1g)
  shows build/runtime logs. `/api/health` exposes the deployed version and revision.
- To retry, run **Type Check** on `main`; deployment follows only on success.
- To pause updates, disable **Deploy live demo** in Actions. For emergency rollback,
  use Render's previous successful deploy; subsequent passing `main` changes will
  replace it, so pause automation first. Prefer reverting the bad change on `main`.
- If rotating the deploy hook, update the GitHub secret before the next deploy.
- Deploys reset temporary demo kitchens. Never attach household data to this service.

See [Render deploy hooks](https://render.com/docs/deploy-hooks).

## Visitor experience

`/` opens `/demo`, which automatically opens an existing kitchen or creates a
new one, then replaces the loading page with `/inventory`. No second landing
page, button click, or account registration is required. A new demo creates
nine inventory items, three recipes, and a shopping list in a separate household.
One recipe is immediately cookable; another is missing Parmesan so visitors can
try shortage previews. Normal kitchen screens and APIs handle all interactions.

The banner explains that sessions expire within 24 hours and can end earlier
when the service restarts. Returning visitors can continue an active session.
Expired sessions are routed through `/demo` to automatically start again. AI and
instance-admin operations stay unavailable to demo identities. Community sharing
is not configured by this deployment.

Render Free sleeps after 15 idle minutes, may take about a minute to wake, and
loses its filesystem on restart, sleep, or redeployment. This resets all demo
kitchens; no 24-hour persistence guarantee is made. Expired demo data is also
cleaned when a new demo starts. Stay within Render's free resource allowances;
do not add a paid disk, database, or scheduled service. Review bandwidth/build
spend limits in the account before public launch.

See [Render Free documentation](https://render.com/docs/free).

## Link the marketing site

In the separate `sous-chef-website` repository, set `DEMO_URL` to the assigned
HTTPS demo origin and rebuild its static site. This is an outbound link to the
real app; no app/database code belongs in the marketing project.

## Acceptance

Verify signup-free entry, cooking deductions, shopping-list changes, two visitor
sessions with independent households, and returning to `/demo` after the server
has lost its temporary database. A successful build alone is not deployment or
end-to-end acceptance.
