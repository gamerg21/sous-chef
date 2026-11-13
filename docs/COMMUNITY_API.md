# Community API v2

The recipe community's HTTP API, served from the community service's
`https://….convex.site` origin, and the local kitchen operations that wrap it.
[API v1](COMMUNITY.md#api-v1) stays in place, unchanged, for Sous Chef for iOS
1.2.x and web servers older than 1.3.0. The TypeScript types are in
`src/lib/community-contract.ts`.

## Conventions

- JSON in and out; errors are `{"error": "message"}` with 400 (invalid),
  401 (missing or bad token), 403 (not allowed), 404, 413 or 429 (rate limit).
- Signed-in requests send `Authorization: Bearer <publisher token>`. A request
  with an invalid token answers 401 even where a token is optional.
- Lists return `{…, "cursor": string | null}`; pass the cursor back as
  `?cursor=` for the next page; `null` means the end. `limit` is 1–50, default 20.
- IDs are opaque strings. Times are ISO 8601 strings.
- Text is checked by the shared word filter (`src/lib/community-filter.ts`)
  when written; rejected text answers 400 "This text isn't allowed in the community".

## Types

```ts
type Author = { id: string; name: string };

/** A recipe in a list. No steps, quantities or inline photo. */
type Listing = {
  id: string; revision: number; createdAt: string; updatedAt: string;
  author: Author;
  title: string; description?: string; tags: string[];
  servings?: number; totalTimeMinutes?: number;
  photoUrl?: string;          // https URL of the photo, when there is one
  ingredientNames: string[];  // for local pantry matching
  likeCount: number; saveCount: number; madeCount: number;
  rating?: number;            // average of "made it" ratings, one decimal; absent with none
  shareUrl?: string;          // public page, when the service has SHARE_URL_BASE
  liked?: boolean;            // only with a token
};

type Tip = { id: string; author: Author; rating: number; tip?: string; createdAt: string };

type Detail = Listing & {
  visibility: 'public' | 'unlisted';
  snapshot: RecipeSnapshot;   // photoDataUrl only with ?photo=inline
  tips: Tip[];                // newest 20 that have text
  viewer?: {                  // only with a token
    liked: boolean; following: boolean; own: boolean;
    made?: { rating: number; tip?: string };
  };
};

type Cook = {
  id: string; name: string; bio?: string;
  recipeCount: number; followerCount: number; followingCount: number;
  viewer?: { following: boolean; own: boolean };
};

type Me = Cook & { moderator: boolean };

type ReportReason = 'offensive' | 'harassment' | 'sexual' | 'spam' | 'dangerous' | 'copyright' | 'other';
```

## Public endpoints

| Endpoint | Behavior |
| --- | --- |
| `GET /api/v2/recipes?sort=&tag=&search=&author=&cursor=&limit=` | `{recipes: Listing[], cursor}`. `sort` is `new` (default), `hot` (recent and engaged) or `top` (most liked). `tag` matches one tag exactly, case-insensitively. `author` is a cook ID. `search` is full text and ignores `sort`; `search`, `tag` and `author` don't combine (precedence: search, author, tag). Public recipes only. |
| `GET /api/v2/recipes/:id?photo=inline` | `Detail` for a public or unlisted recipe; 404 otherwise. |
| `GET /api/v2/recipes/:id/tips?cursor=&limit=` | `{tips: Tip[], cursor}`, newest first. |
| `GET /api/v2/revisions?ids=a,b,c` | `{revisions: {[id]: number \| null}}` for up to 100 IDs; `null` when the recipe is gone or hidden. |
| `GET /api/v2/tags` | `{tags: [{tag, count}]}`: the 30 most used tags on public recipes. |
| `GET /api/v2/cooks/:id` | `Cook`; 404 for unknown or banned cooks. |
| `POST /api/v2/save` `{id, clientKey}` | Counts a saved copy once per `clientKey` (64 hex characters; a hash that identifies the install or local account, never a raw ID). `{saveCount}`. Rate limited per address. |
| `POST /api/v2/report` `{recipeId, tipId?, reason, note?, clientKey?}` | Files a report; a token is optional. One open report per reporter and target. `{success: true}`. Rate limited per address. |

## Signed-in endpoints

| Endpoint | Behavior |
| --- | --- |
| `POST /api/v2/me` `{}` | `Me` |
| `POST /api/v2/me/profile` `{name?, bio?}` | Name 1–40 characters, bio up to 160. `Me` |
| `POST /api/v2/me/recipes` `{cursor?}` | `{recipes: (Listing & {visibility: 'public' \| 'unlisted' \| 'private', removed: boolean, underReview: boolean})[], cursor}`: everything the cook published. |
| `POST /api/v2/like` `{id, liked}` | `{liked, likeCount}`; idempotent. |
| `POST /api/v2/made` `{id, rating, tip?}` | One per cook and recipe; sending again replaces it. `rating` is an integer 1–5, `tip` up to 280 characters. A cook can't rate their own recipe. `{madeCount, rating}` |
| `POST /api/v2/made/delete` `{id}` | Removes the cook's own entry. `{madeCount, rating?}` |
| `POST /api/v2/follow` `{userId, following}` | `{following, followerCount}`; idempotent; at most 200 followed cooks; not yourself. |
| `POST /api/v2/feed/following` `{cursor?, limit?}` | `{recipes: Listing[], cursor}`: public recipes from followed cooks, newest first. |

Publishing and unpublishing stay on `POST /api/v1/publish` and
`POST /api/v1/unpublish`. The photo in a published snapshot is moved to file
storage; lists carry its `photoUrl`.

## Moderator endpoints

Only for accounts made moderators with
`pnpm exec convex run moderation:setModerator '{"userId":"…","moderator":true}'`.
Others get 403.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/v2/mod/reports` `{status?, cursor?}` | `{reports: Report[], cursor}`; `status` is `open` (default), `actioned` or `dismissed`. |
| `POST /api/v2/mod/resolve` `{reportId, action, reason?}` | `action` is `dismiss`, `remove_recipe`, `remove_tip` or `ban_user`. Resolves every open report on the same target. `{success: true}` |

```ts
type Report = {
  id: string; status: 'open' | 'actioned' | 'dismissed'; createdAt: string;
  reason: ReportReason; note?: string; reportCount: number; // open reports on this target
  recipe: { id: string; title: string; author: Author; visibility: string; underReview: boolean } | null;
  tip?: { id: string; author: Author; rating: number; tip?: string };
  resolution?: string; resolvedAt?: string;
};
```

A recipe with open reports from three different reporters (signed-in cooks
count one each; reports without an account count once per network address) is hidden from lists
and its page ("under review"; a moderator's token still opens it) until a moderator resolves them: dismissing
restores it, removing keeps it hidden for good. New reports are emailed to
`MODERATION_EMAIL` when the service has `RESEND_API_KEY` and `SMTP_FROM`.

## Compatibility

- `GET /api/v1/recipes` and `GET /api/v1/recipes/:id` keep their shape. Photos
  are inlined as `snapshot.photoDataUrl` again; a v1 list stops inlining
  photos once the response would pass 6 MB, so older clients keep loading.
- Existing publications are migrated in place with
  `pnpm exec convex run migrations:run` (photos to file storage, counters, tags).
  Every reader handles both migrated and unmigrated documents.

## Local kitchen operations

The web UI and the iOS companion mode call these through the local server
(`src/server/kitchen/community.ts`). The operations from before 1.3.0
(`community:listRecipes`, `getRecipe`, `saveRecipe`, `publishRecipe`,
`unpublishRecipe`, `connection`, `setConnection`) keep their arguments and
results, because Sous Chef for iOS 1.2.x calls them.

Operations that need a community account use the caller's stored connection
and fail with "Connect your community account first" without one. Reads send
the token when there is one, so `liked` and `viewer` are filled in.

| Operation | Arguments | Result |
| --- | --- | --- |
| `community:feed` | `{sort?, tag?, search?, author?, cursor?, limit?, pantry?}` | `{recipes: LocalListing[], cursor, available}` |
| `community:followingFeed` | `{cursor?, limit?}` | `{recipes: LocalListing[], cursor, available}` |
| `community:recipe` | `{id}` | `LocalDetail` |
| `community:tips` | `{id, cursor?}` | `{tips: Tip[], cursor}` |
| `community:tags` | `{}` | `{tags: [{tag, count}]}` |
| `community:cook` | `{id}` | `Cook & {blocked: boolean}` |
| `community:me` | `{}` | `{configured, connected, me: Me \| null}` |
| `community:updateProfile` | `{name?, bio?}` | `Me` |
| `community:myRecipes` | `{cursor?}` | as `/api/v2/me/recipes` |
| `community:like` | `{id, liked}` | `{liked, likeCount}` |
| `community:made` | `{id, rating, tip?}` | `{madeCount, rating}` |
| `community:removeMade` | `{id}` | `{madeCount, rating?}` |
| `community:follow` | `{userId, following}` | `{following, followerCount}` |
| `community:report` | `{recipeId, tipId?, reason, note?}` | `{success: true}`; also hides the reported recipe, or the one reported tip, for the caller |
| `community:hide` | `{kind: 'recipe' \| 'author', key, label, hidden}` | `{success: true}` |
| `community:hidden` | `{}` | `{recipes: [{key, label}], authors: [{key, label}]}` |
| `community:updates` | `{}` | `{updates: [{recipeId, title, remoteId, savedRevision, latestRevision}]}` |
| `community:applyUpdate` | `{recipeId}` | `{success: true}`: replaces the saved copy's title, description, tags, servings, time, photo, ingredients and steps with the latest revision |
| `community:dismissUpdate` | `{recipeId}` | `{success: true}`: stops offering that revision |
| `community:modReports` | `{status?, cursor?}` | as `/api/v2/mod/reports` |
| `community:modResolve` | `{reportId, action, reason?}` | `{success: true}` |

```ts
type LocalListing = Listing & {
  saved: boolean; // this household already has a copy
  pantry?: { have: number; total: number; missing: string[] }; // with pantry: true
};
type LocalDetail = Detail & { saved: boolean; savedRecipeId?: string; pantry?: LocalListing['pantry'] };
```

- `community:feed` with `pantry: true` reads up to 100 listings for the other
  arguments, matches each `ingredientNames` against the household's in-stock
  items on this server, and returns them ordered by the share of ingredients
  on hand (`cursor` is `null`). Pantry data never leaves the server.
- Lists and details leave out recipes and cooks the caller hid or blocked and
  anything the word filter catches.
- `community:saveRecipe` also reports the save to `/api/v2/save`.
- `feed`, `followingFeed`, `recipe`, `updates`, `applyUpdate`, `dismissUpdate` and
  `saveRecipe` take an optional `householdId`: the kitchen whose pantry and
  saved copies to use, which the caller must belong to. Without it they use
  the caller's current kitchen. The iOS app sends the kitchen it is showing.
- A community service without API v2 makes `community:feed` answer
  `available: false`; update the community service before its web servers.
- A server older than 1.3.0 answers these with `Unknown operation`; clients
  fall back to the pre-1.3.0 operations.
