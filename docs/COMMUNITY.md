# Community service and hosted demo

## Separation

`src/server/kitchen/` owns private SQLite kitchens. `convex/` owns community
accounts, revocable publisher tokens, publication snapshots and their photos,
likes, saves, "made it" ratings and tips, follows, cook profiles, reports, and
rate limits. A community outage does not block kitchen operations.

Publishing explicitly uploads title, description, tags, servings, duration,
ingredients, instructions, source URL, and an optional selected local photo.
Private notes, inventory mappings, stock, household membership, and AI keys are
excluded. Public recipes appear in search. Unlisted recipes require their link;
they never appear in the public feed. Unpublishing hides the remote snapshot;
it cannot retract copies already downloaded.

Imports create independent local recipes and preserve source author, publication
ID, service origin, and revision. There is no automatic bidirectional sync.
A publication carries one photo of up to 500 KB and a bounded recipe payload.
The service keeps the photo in Convex file storage and lists link to it; remote
image URLs are not fetched by the publishing service. Titles, descriptions,
tags, ingredients, steps, names, bios and tips are checked against a shared
word list (`src/lib/community-filter.ts`) and refused when they match.

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
per community user. Sous Chef for iOS 1.2.x and web servers older than 1.3.0
use only these endpoints, so they keep their request and response shapes: a
recipe's photo is still returned inline as `snapshot.photoDataUrl`. A v1 list
stops adding photos once they total 6 MB, so a long list stays loadable.

## API v2

[Community API v2](COMMUNITY_API.md) is the full reference. It adds:

- Paged lists sorted by newest, "hot" (recent and engaged) or most liked,
  filtered by tag, cook or full-text search, plus the most used tags.
- Likes, saved-copy counts, and "made it" entries with a 1–5 rating and an
  optional tip.
- Cook profiles with a bio, following, and a feed of followed cooks' recipes.
- Reports from the apps, with or without an account, and a moderator queue.
- Photo links instead of inline photos, and a revision check so a kitchen can
  tell when a saved recipe has a newer version.

Signed-in writes are rate limited per account; saves and reports are rate
limited per client address. A recipe's share link is included when the
deployment has `SHARE_URL_BASE`.

### After upgrading an existing community

Deploy, then run the migration once against that deployment (add `--prod` for
production):

```sh
pnpm exec convex run migrations:run
```

It moves photos that are still stored inside publications to file storage and
fills in like counts, the "hot" order, tags and each cook's recipe count. It
prints how many publications it visited and how many photos it moved. It is
safe to run again at any time and to interrupt; to work in slices, pass
`'{"maxRecipes":200}'` and then the `cursor` it returns until it reports
`done`. Until it has run, everything keeps working, with two gaps: the tag
filter, tag list and cooks' recipe counts only include recipes published or
changed since the upgrade.

### Settings

Set these on the community deployment with `pnpm exec convex env set NAME value`.
All are optional.

| Setting | Effect |
| --- | --- |
| `SHARE_URL_BASE` | Base of the public recipe page, e.g. `https://souschefkitchen.app/r`. Lists and details then include `shareUrl` (`<base>/<recipe id>`). |
| `MODERATION_EMAIL` | Address that receives an email for each new report. Needs `RESEND_API_KEY` and `SMTP_FROM` too. |
| `RESEND_API_KEY`, `SMTP_FROM` | Email delivery, shared with password recovery ([Convex setup](CONVEX_SETUP.md)). |

## Moderation

The rules are published at https://souschefkitchen.app/community-guidelines/,
which promises review within 24 hours.

### How reports arrive

Anyone can report a recipe or a tip from the apps, signed in or not, with a
reason and an optional note. The service keeps one open report per reporter
and target, and stores only a hash of who reported. The reporting app also
hides the recipe for the reporter and lets people block cooks.

- Each new report is emailed to `MODERATION_EMAIL` when email is configured.
  The email has the recipe title and ID, the author ID, the reason, the note
  and the number of open reports. A failed email never fails the report.
- When three different reporters have an open report on the same recipe, the
  recipe goes "under review": it disappears from every list, search and feed,
  its page and link stop working, and its author sees it marked as under
  review. Republishing doesn't bring it back. Reports about a tip never hide
  the recipe.
- Sous Chef for iOS 1.2.x still sends reports by email to
  community@souschefkitchen.app; handle those with the commands below.

### Moderators

Give an account the moderator role (the user ID is the author ID shown in a
report, or `userId` from `POST /api/v1/me`):

```sh
pnpm exec convex run moderation:setModerator '{"userId":"<user id>","moderator":true}'
pnpm exec convex run moderation:moderators
```

Moderators see the report queue in the apps and resolve a report with one of
four actions. Resolving closes every open report on the same recipe or tip.

| Action | Effect |
| --- | --- |
| Dismiss | Closes the reports. A recipe under review is listed again. |
| Remove recipe | Hides the recipe for everyone, for good, and deletes its photo; the author can't republish it. |
| Remove tip | Hides the tip and takes its rating out of the recipe's average. |
| Ban user | Bans the author of the reported recipe or tip (see `banUser` below). |

Set `"moderator":false` to withdraw the role. A banned or deleted account
loses it.

A recipe under review keeps its photo until a moderator removes the recipe, so
someone who already has the photo's direct link can still open it meanwhile.

### Commands

The same actions are available as internal functions (Convex dashboard or CLI;
add `--prod` for the production community):

| Command | Effect |
| --- | --- |
| `pnpm exec convex run moderation:recipe '{"id":"<recipe id>"}'` | Show a recipe, including hidden ones, with its author and ban state |
| `pnpm exec convex run moderation:removeRecipe '{"id":"<recipe id>","reason":"Spam"}'` | Hide it for everyone and delete its photo; the author can't republish it |
| `pnpm exec convex run moderation:restoreRecipe '{"id":"<recipe id>"}'` | Undo a removal (stays private until the author republishes, which also brings the photo back) |
| `pnpm exec convex run moderation:banUser '{"userId":"<author id>","reason":"Harassment"}'` | Remove all their recipes, hide their tips, revoke publishing and any moderator role, and block their Apple ID from signing in again, even after account deletion |
| `pnpm exec convex run moderation:unbanUser '{"userId":"<author id>"}'` | Lift a ban; removed recipes and hidden tips stay that way |
| `pnpm exec convex run moderation:setModerator '{"userId":"<user id>","moderator":true}'` | Grant (or with `false`, withdraw) the moderator role |

Removing a recipe from the command line leaves its reports open in the queue;
dismiss them there.

### Moderating from the web app

Community moderators can work the report queue in the web app instead of the
CLI. Make an account a moderator with
`pnpm exec convex run moderation:setModerator '{"userId":"<user id>","moderator":true}'`,
then connect a kitchen to that account (Community → Connect community account).
The connection page then links to the moderation queue at
`/community/moderation`; everyone else sees "This page isn't available" there.

The queue lists open, actioned and dismissed reports. Each open report can be
dismissed, or acted on by removing the recipe, removing the tip (tip reports)
or banning the cook who wrote the reported content. Every action asks for
confirmation, takes an optional reason, and closes all open reports on the same
recipe or tip. The endpoints are in [Community API v2](COMMUNITY_API.md#moderator-endpoints).

People report recipes and tips, hide recipes and block cooks from the More menu
on community screens. Hidden recipes and blocked cooks are kept on the local
server and listed under Community → Connect community account → Hidden & blocked.

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
publications and their photos, likes, ratings and tips, follows in both
directions, profile, moderator role, publisher tokens, Apple credentials,
Convex Auth accounts, sessions and user. Other recipes' like counts and
ratings, and other cooks' follower counts, are corrected. A failed revocation
is logged and does not block deletion.

`pnpm exec convex run apple:checkConfig` checks the Apple settings: a response of
`invalid_grant` means Apple accepted the team, key and bundle ID.

`/explore` on the Next.js app is public. Downloads from
`/api/community/recipes/:id` are portable JSON files accepted by the local recipe
library's Import command, including publication attribution and embedded photos.

## Hosted demo

For a disposable free-host deployment, see [Render demo](RENDER_DEMO.md).

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
