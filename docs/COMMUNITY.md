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

The contract is in `src/lib/community-contract.ts`. Mutation endpoints validate
bearer tokens, authorship, payload shape, and limits. Publishing is rate limited
per community user. Feed pagination, likes/comments, reporting queues, and
moderation administration are future work; do not advertise them as implemented.

`/explore` on the Next.js app is public. Downloads from
`/api/community/recipes/:id` are portable JSON files accepted by the local recipe
library's Import command, including publication attribution and embedded photos.

## Hosted demo

Run the same app with `SOUS_CHEF_DEMO=true` on a persistent disk. `/` becomes the
public landing page; `/demo` creates a private sample household with a 24-hour
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
