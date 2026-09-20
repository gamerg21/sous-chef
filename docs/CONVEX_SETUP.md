# Convex community setup

**Local kitchens do not need this guide.** Start them with `pnpm dev` or
`./homelab.sh up`. Convex is only the optional shared recipe service.

For a new community deployment:

1. Use Node.js 22.18+ and the pinned pnpm version.
2. Select/create the intended Convex project with `pnpm exec convex dev`.
3. Initialize Convex Auth keys with `pnpm exec auth` only for a new deployment.
   Never replace existing JWT signing keys or providers during an update.
4. Set the deployment's `SITE_URL` to the hosted community web app origin.
   Keep an existing `APP_BASE_URL` override consistent with it.
5. Optionally configure `RESEND_API_KEY` and `SMTP_FROM` for recovery email.
6. Deploy to the explicitly selected dev deployment with `pnpm exec convex dev --once`.
   Use the production deploy command only after identifying and authorizing that target.
7. Configure the web app's `COMMUNITY_API_URL` (`.convex.site`) and
   `COMMUNITY_CONVEX_URL` (`.convex.cloud`), and test Connect community account.

Schema: Convex Auth tables, `hubRecipes`, `hubTokens`, and `authRateLimitEvents`.
There is no units seed or kitchen bootstrap on Convex.

Existing deployments need [the migration guide](SQLITE_MIGRATION.md) before any
private kitchen data is removed. See [community operations](COMMUNITY.md) for
HTTP endpoints, account boundaries, and publication semantics.
