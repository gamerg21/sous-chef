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
   Without them, community password reset is unavailable; reset links are
   never written to logs.
6. For Sign in with Apple in the iOS app, set `APPLE_TEAM_ID`, `APPLE_KEY_ID`
   (a Sign in with Apple key), `APPLE_BUNDLE_ID` (the app's bundle ID) and
   `APPLE_PRIVATE_KEY` (the key's `.p8` contents). Pass the key from its file
   without printing it: `pnpm exec convex env set APPLE_PRIVATE_KEY -- "$(cat AuthKey_XXXX.p8)" >/dev/null`.
   Verify with `pnpm exec convex run apple:checkConfig`.
7. Deploy to the explicitly selected dev deployment with `pnpm exec convex dev --once`.
   Use the production deploy command only after identifying and authorizing that target.
8. Configure the web app's `COMMUNITY_API_URL` (`.convex.site`) and
   `COMMUNITY_CONVEX_URL` (`.convex.cloud`), and test Connect community account.
9. Optionally set `SHARE_URL_BASE` (public recipe page, for share links) and
   `MODERATION_EMAIL` (receives new reports; needs the email settings from
   step 5). Give at least one account the moderator role. See
   [community operations](COMMUNITY.md#moderation).
10. When updating a community that existed before API v2, run
    `pnpm exec convex run migrations:run` once after deploying. See
    [After upgrading an existing community](COMMUNITY.md#after-upgrading-an-existing-community).

Schema: Convex Auth tables, plus:

| Table | Holds |
| --- | --- |
| `hubRecipes` | Publications: the recipe snapshot, visibility, revision, counters, and the ID of the photo in file storage |
| `hubRecipeTags`, `hubTagCounts` | Tags of publicly listed recipes, and how many recipes use each |
| `hubLikes`, `hubSaves`, `hubMade` | Likes, saved-copy counts (one per install), and "made it" ratings and tips |
| `hubFollows`, `hubProfiles` | Who follows whom; each cook's bio and counters |
| `hubReports`, `hubModerators`, `hubBans` | Reports, the moderator role, and bans |
| `hubTokens`, `appleCredentials` | Publisher token hashes; Apple refresh tokens kept for account deletion |
| `authRateLimitEvents` | Rate limit windows |

Recipe photos are in Convex file storage.
There is no units seed or kitchen bootstrap on Convex.

Existing deployments need [the migration guide](SQLITE_MIGRATION.md) before any
private kitchen data is removed. See [community operations](COMMUNITY.md) for
HTTP endpoints, account boundaries, and publication semantics.
