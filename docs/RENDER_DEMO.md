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
- Manual deployments, so unrelated pushes do not restart demo sessions.

Request a service name containing `souschef`, such as `souschef-demo`.
Render assigns an `onrender.com` address; use the actual address shown in the
service dashboard rather than assuming a name is available. If configuring
manually, copy the Docker command and environment values from `render.yaml`,
and set `APP_URL` to your assigned origin (without `/demo`).

The hosted demo is https://souschef-demo.onrender.com/demo, deployed from
`codex/render-demo`. The marketing site links to this address through its
production `DEMO_URL` setting.

## Visitor experience

`/` opens `/demo`. Starting a demo requires no account registration and creates
nine inventory items, three recipes, and a shopping list in a separate household.
One recipe is immediately cookable; another is missing Parmesan so visitors can
try shortage previews. Normal kitchen screens and APIs handle all interactions.

The banner explains that sessions expire within 24 hours and can end earlier
when the service restarts. Returning visitors can continue an active session.
Expired sessions are routed back to the demo entry page to start again. AI and
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
