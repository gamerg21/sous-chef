# Community service and hosted demo

## Separation

`src/server/kitchen/` owns private SQLite kitchens. `convex/` owns community
accounts, revocable publisher tokens, publication snapshots, and rate limits.
A community outage does not block kitchen operations.

Publishing explicitly uploads title, description, tags, servings, duration,
ingredients, instructions, source URL, and an optional selected local photo.
Private notes, inventory mappings, stock, household membership, and AI keys are
excluded. Public recipes appear in search. Unlisted recipes require their link;
they never appear in the public feed. Unpublishing hides the remote snapshot;
it cannot retract copies already downloaded.

Imports create independent local recipes and preserve source author, publication
ID, service origin, and revision. There is no automatic bidirectional sync.
The first protocol version supports a 500 KB publication photo and bounded recipe
payloads. Remote image URLs are not fetched by the publishing service.

## Configure a service

Use [Convex setup](CONVEX_SETUP.md). Each installation sets:

```dotenv
COMMUNITY_API_URL=https://YOUR-DEPLOYMENT.convex.site
COMMUNITY_CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud
```

These two origins must identify the same service. Community → Connect community
account signs directly into that service, then creates a revocable 90-day publisher
token stored encrypted on the local server. Local instance passwords/cookies are
never accepted as community identity. No deploy/admin key belongs in an app image.
Revoke all connections from the connection screen. Signing out of the community
UI alone does not revoke the previously authorized server connection.

## API v1

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v1/recipes?search=...&limit=20` | Public search/list, maximum 50 |
| `GET /api/v1/recipes/:id` | Public/unlisted snapshot |
| `POST /api/v1/me` | Validate a bearer publisher token |
| `POST /api/v1/publish` | Create/update own snapshot; revision increases |
| `POST /api/v1/unpublish` | Hide own publication |
| `POST /api/v1/apple/session` | Sign in with Apple; returns a publisher token and `{id, name}` |
| `POST /api/v1/me/name` | Change own display name (1–40 characters) |
| `POST /api/v1/account/delete` | Delete own account and publications; revokes Apple sign-in |

The contract is in `src/lib/community-contract.ts`. Mutation endpoints validate
bearer tokens, authorship, payload shape, and limits. Publishing is rate limited
per community user. Feed pagination, likes/comments, an in-app reporting queue
and a moderation dashboard are future work; do not advertise them as implemented.

## Moderation

The iOS app emails reports to community-souschef@georgevina.com, hides the
recipe for the reporter, and lets people block cooks. The rules are published
at https://sous-chef-website.vercel.app/community-guidelines/, which promises
review within 24 hours. Each report includes the recipe ID, the author's user
ID and a recipe link.

Act on reports with internal functions (Convex dashboard or CLI; add `--prod`
for the production community):

| Command | Effect |
| --- | --- |
| `pnpm exec convex run moderation:recipe '{"id":"<recipe id>"}'` | Show a recipe, including hidden ones, with its author and ban state |
| `pnpm exec convex run moderation:removeRecipe '{"id":"<recipe id>","reason":"Spam"}'` | Hide it for everyone; the author can't republish it |
| `pnpm exec convex run moderation:restoreRecipe '{"id":"<recipe id>"}'` | Undo a removal (stays private until the author republishes) |
| `pnpm exec convex run moderation:banUser '{"userId":"<author id>","reason":"Harassment"}'` | Remove all their recipes, revoke publishing, and block their Apple ID from signing in again, even after account deletion |
| `pnpm exec convex run moderation:unbanUser '{"userId":"<author id>"}'` | Lift a ban; removed recipes stay removed |

## Sign in with Apple (iOS app)

The iOS app publishes directly to a community with Sign in with Apple when no
Sous Chef server is connected. Browsing, saving and reporting need no account.

`POST /api/v1/apple/session` takes `{identityToken, authorizationCode, nonce, fullName?}`.
The server verifies the identity token against Apple's JWKS (issuer
`https://appleid.apple.com`, audience `APPLE_BUNDLE_ID`, expiry) and requires its
`nonce` claim to equal the SHA-256 hex of the raw `nonce` sent. The Apple `sub`
maps to a Convex Auth `authAccounts` row (`provider: "apple"`) and a `users` row.
The name comes only from Apple (sent on first authorization); without one it is
"Community cook", and an existing name is never replaced. The authorization code
is exchanged for an Apple refresh token, stored server-side in `appleCredentials`
only so it can be revoked. The response is a 90-day publisher token, issued like
web connections. Requests are rate limited per client address and per Apple user.

`POST /api/v1/account/delete` (Bearer publisher token) revokes the Apple refresh
token through `https://appleid.apple.com/auth/revoke`, then deletes the person's
publications, publisher tokens, Apple credentials, Convex Auth accounts,
sessions and user. A failed revocation is logged and does not block deletion.

`pnpm exec convex run apple:checkConfig` checks the Apple settings: a response of
`invalid_grant` means Apple accepted the team, key and bundle ID.

`/explore` on the Next.js app is public. Downloads from
`/api/community/recipes/:id` are portable JSON files accepted by the local recipe
library's Import command, including publication attribution and embedded photos.

## Hosted demo

Run the same app with `SOUS_CHEF_DEMO=true` on a persistent disk. `/` redirects to
the demo entry page at `/demo`, which creates a private sample household with a 24-hour
session. Publishing requires a separate community account. AI and instance admin
operations are disabled for demo identities.

Run `node scripts/cleanup-demo.mjs` regularly against the demo data directory
(e.g. hourly). The app also cleans expired demos when a new visitor starts one.
Use HTTPS and set `APP_URL` to the exact public origin. The demo must use its own
data volume, separate from any personal kitchen.

Before a public launch, choose domain/hosting, configure email for community
account recovery, set infrastructure rate limits and storage budgets, and establish
moderation/recipe-sharing terms. This repository provides the working foundation;
a local build or a community backend push does not publish the web demo.
