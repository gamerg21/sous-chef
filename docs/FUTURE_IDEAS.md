# Future ideas

Ideas that came up while planning the 1.1.0 work (meal planning, expiry
reminders, cook timer Live Activities and widgets) but weren't built. Nothing
here is committed to; it's a list to pick from.

## Next features

### Serving scaling everywhere

Planned meals already cook and shop at their planned servings. Recipes opened
directly don't: on iOS, cooking from a recipe page still deducts the recipe's
base amounts. Let people scale any recipe (2×, or a number of servings) and
have readiness, shortages, shopping amounts and cooking deductions all follow.
The cook endpoints already accept a `scale`, so most of the work is UI.

### Cook history and personal notes

Recipes have "last cooked" data that isn't shown. Show "last made 3 weeks ago"
on recipes, keep a short "what I changed" note per cook, and suggest favorites
that haven't been made in a while.

### Dietary and allergen tags

Household-level tags (vegetarian, nut-free, gluten-free and so on). Use them to
filter recipes, guide AI recipe drafts, and warn when a community recipe being
imported conflicts with them.

### Reminders export

On iOS, add exporting the shopping list to Apple Reminders for people who shop
from Reminders. (Aisle grouping on the web is covered by the store-first
shopping list below.)

### Receipt scanning and grocery prices

Label and recipe scanning already exist on iOS. Scanning a grocery receipt
could fill the "Put purchases away" flow, matching receipt lines to shopping
items and pantry foods, so restocking takes seconds.

The same scan can record what each item cost and where it was bought. Keep a
price history per food and store, and show the last price paid on the
shopping list ("$3.49 at Costco, Sep 12") so it's easy to spot a price change
while shopping. Prices could also be typed in when putting purchases away, for
people who don't scan receipts. Later this could estimate a shopping trip's
total or a planned meal's cost.

### Preferred stores and a store-first shopping list

Let a household save the grocery stores it uses and mark one as preferred. Each
shopping item can be assigned a store, defaulting to the preferred one or to
where it was last bought (from receipt prices above).

The shopping list then becomes a hierarchy: **store → aisle or category →
items**. For example, Costco → Produce → spinach, then Trader Joe's → Dairy →
milk. Unassigned items fall under the preferred store. Being able to collapse
a store's section, or show just one store, would help on a trip. This builds
on the aisle grouping iOS already has, and the web list would get the same
structure.

### Manage your own community recipes

Today the community can already take a new version of a recipe: publishing
again replaces its snapshot and bumps `revision` and `updatedAt` in
`convex/hub.ts`. Unpublishing hides it (`visibility: 'private'`) but keeps the
record. Neither is visible to other cooks: browse and detail show only
`createdAt`, and there's no record of what changed.

- **My published recipes:** one place on the web and iOS listing everything
  you've published, with its status (public, unlisted, hidden, or removed by a
  moderator), last update and revision. Each has actions to update, unpublish
  or delete it.
- **Updates with a change note:** when pushing an update, ask for an optional
  short note ("Cut the sugar to ½ cup, added a resting step"). Store the date
  and note with each revision and show "Updated Oct 3 · Cut the sugar…" on the
  community recipe, with the earlier notes listed below. Cooks who imported the
  recipe could later be told a newer version exists. Automatic syncing of
  imported copies isn't implemented and should stay opt-in.
- **Unpublish vs. delete:** keep unpublish as a reversible "take it down"
  that hides the recipe but lets you publish it again. Add a permanent delete
  that removes the recipe and its photos from the community after a
  confirmation. Copies other cooks already imported stay in their kitchens,
  because imports are independent copies. A "Take down all my recipes" action
  could sit beside the existing delete-account option.
- **Moderation:** a recipe removed by a moderator can't be republished today.
  Show that clearly in the list, with the removal reason, and keep reports
  attached to the recipe across updates.

## Left over from 1.1.0

### Daily expiry email (tabled)

Built and then removed before release so the project doesn't depend on a paid
email service. The original code is on the `worktree-agent-afce70508f53c5753`
branch (commit 4a03d7f): a Resend sender, a once-a-day scheduler that survives
restarts without sending twice, and an opt-in setting. Revisit only with a
free sending option, or as a self-hoster opt-in that uses their own provider.

### Cook timers

- **Lock Screen with four or more timers:** the Lock Screen shows the next
  timer plus two more, so a fourth is hidden. Show two rows and a "+N more"
  line, as the Dynamic Island now does.
- **Shorter format for long timers:** show `2h 59m` instead of `2:59:11` in
  the smaller rows. iOS 18's timer text format can limit the units it shows;
  confirm it works in a widget before using it.
- **"Done" without opening the app:** a finished timer stays at 0:00 on the
  Lock Screen until the app updates the activity. Look at the activity's stale
  date or a scheduled update so it switches to "Done" on its own.
- **Time Sensitive notifications:** add the capability so timer alerts get
  through Focus modes.

### Expiry reminders

- **Used vs. thrown away on iOS:** the monthly tally is web-only because it
  needs a new synced data model. Add it when there's another reason to change
  the iCloud schema.
- **Repeat reminders for expired food:** an expired item left in the pantry is
  mentioned in every daily reminder until it's removed. Consider mentioning it
  once or twice, then only on the Pantry's "Use soon" list.
- **Items zeroed by hand:** setting an item to zero, or removing it before its
  date, isn't counted as used or thrown away.

### Release tooling

`pnpm ios:testflight upload` signs with the team API key, which couldn't
create the new widget extension's signing profile or sign for distribution
("Cloud signing permission error"). 1.1.0 (1) was archived and uploaded with
the Apple ID signed in to Xcode instead. Either give the key the Admin role in
App Store Connect or let the script fall back to Xcode's account.

### Still to check by hand

- The new Plan sheets on a Mac ("Designed for iPad").
- Web cooking with expiring items using real data (covered only by tests).

## Probably not yet

- **Community likes, comments or federation:** each adds moderation work, and
  the community isn't the app's core value yet.
- **Extensions and integrations catalog:** still a preview with no adapters.
  Wait for a concrete integration someone wants, such as grocery delivery.
