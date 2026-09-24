# Sous Chef for iOS

A native SwiftUI port of Sous Chef for iPhone and iPad (iOS 26+). It works on
its own, syncs through the person's iCloud, and can optionally act as a
companion to a self-hosted Sous Chef server.

## What's in it

| Tab | Web equivalent | Notes |
| --- | --- | --- |
| Pantry | Inventory | Pantry, fridge and freezer with brand, amounts, expiry (quick durations or a calendar) and nutrition; VisionKit barcode scanning with Open Food Facts lookup, and label scanning for products it doesn't know. |
| Recipes | Recipes | Library, editor, import from a link (schema.org JSON-LD), pasted text, or photos and screenshots of cookbook pages, pantry readiness, nutrition, sharing. |
| Cook | Cooking | Recipes ranked by what you have, cook mode with timers, and pantry deduction. |
| Shopping | Shopping list | Aisle grouping, AI aisle sorting, and putting purchases away into the pantry. |
| Community | Community | Browse and save community recipes; publish with Sign in with Apple or through a server. |

Settings (the toolbar button on every tab) covers iCloud, the companion server,
Apple Intelligence, Open Food Facts, and recipe import/export in the same JSON
format as the web app.

The main navigation is the system `TabView`, so it gets the Liquid Glass tab bar,
minimizes while scrolling, and becomes a sidebar on iPad.

## Build and run

Open `ios/SousChef.xcodeproj` in Xcode 27 and run the **SousChef** scheme. The
project uses folder-synchronized groups, so new files under `SousChef/` are
picked up without editing the project file.

From the command line:

```sh
cd ios
xcodebuild -scheme SousChef -destination 'platform=iOS Simulator,name=iPhone 18 Pro' build
xcodebuild -scheme SousChef -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Launch arguments: `-seedSample` fills an empty kitchen with sample data, and
`-uiTesting` uses an in-memory store.

### Signing and capabilities

The target uses team `X423ZKYPDN` and bundle ID `com.georgevina.souschef`. The first
signed device build registers these capabilities for the App ID:

- **Sign in with Apple** (`com.apple.developer.applesignin`), for the optional
  community account.
- **iCloud (CloudKit)** with container `iCloud.com.georgevina.souschef`, plus push
  notifications and the remote-notification background mode for CloudKit changes.

Private Cloud Compute (`com.apple.developer.private-cloud-compute`) is a managed
entitlement that automatic signing can't add until Apple grants it to the team.
It isn't in `SousChef.entitlements` yet, so device builds use the on-device
model. Once the team has it, add the key back (`<true/>`) and the app picks
Apple's larger model automatically.

iCloud containers can't be deleted once created, so choose the final bundle ID
and container name before the first signed build. Unsigned simulator builds
detect the missing entitlements and fall back to local storage and the
on-device model instead of crashing.

## Data

Everything lives in a SwiftData store. Models follow CloudKit's rules (no unique
constraints, every property optional or defaulted), and the store syncs through
the person's private CloudKit database when iCloud is on. There is no Sous
Chef-operated backend.

## Apple Intelligence

`AI/KitchenAI.swift` picks the first available engine:

1. **Private Cloud Compute** (iOS 27+): Apple's larger model, run on Apple silicon
   servers that don't retain requests. No API key or third-party service.
2. **On-device Foundation Model** (iOS 26+).
3. **The connected Sous Chef server**, using the AI provider configured there.

It powers recipe ideas, from the pantry or open-ended (streamed with guided generation), reading package labels, reading recipes
from pasted text or pages without structured data, aisle sorting, and the
"Ask Sous Chef" chat in recipe and cook views. Ingredient amounts from pasted
text are parsed deterministically, so the model can't invent them.

Recipe and label scanning read photos on device with Vision. For recipe pages,
the plain text reader's ingredient and step lists win when the page has clear
sections and the model returns fewer lines. For package labels, the model
extracts name, brand, net contents, storage and the nutrition panel. Nutrition
is rescaled to per 100 g in code, and a value is kept only when its row appears
in the label text.

Brands are stored on the device and in iCloud. The server keeps brands only on
barcode records, so a connected server doesn't receive hand-entered brands.

## Siri and Shortcuts

`Intents/` exposes the kitchen through App Intents, so the same actions work
in Siri, Shortcuts, Spotlight and the Action button. Everything runs on the
device against the local store; no API key is involved.

Apple's app schema domains don't include food, recipes or grocery lists, so
these are custom intents. Siri reaches them through the App Shortcut phrases in
`SousChefShortcuts.swift` (Apple allows ten), which work as soon as the app is
installed:

| Say | Intent |
| --- | --- |
| "What can I make with Sous Chef" | Ranks saved recipes by pantry coverage, favoring food that expires soon |
| "What's in my fridge in Sous Chef" | Lists what's on hand, optionally by location |
| "What's expiring in Sous Chef" | Food expiring in the next few days |
| "Add to my Sous Chef shopping list" | Siri asks what; "milk, eggs and bread" becomes three items |
| "What's on my Sous Chef shopping list" | Reads the open items |
| "I ran out of something in Sous Chef" | Empties the pantry item and adds it to the list; asks before acting on a close name match |
| "Give me a new recipe idea in Sous Chef" | Apple Intelligence drafts a pantry-first recipe and saves it if you say yes |
| "Shop for Pesto Pasta in Sous Chef" | Adds the recipe's missing ingredients to the list |
| "Save this recipe to Sous Chef" | Imports a recipe link, such as one Siri found or the page open in Safari, and saves it; a link already saved isn't duplicated |
| "Open Pesto Pasta in Sous Chef" | Opens the recipe |

"Check off" an item, Start Cooking, and Save Recipe from Text (copied or
dictated recipe text; text that's only a link imports the page) are available in
Shortcuts. The save actions take a link or text parameter, which is what lets
Siri pass along a recipe it found or content from the screen; whether it chains
those steps is up to Siri. On iOS 27, recipes also adopt
the `.system.open` schema, so Apple Intelligence can open them without an
exact phrase. Recipes are indexed in Spotlight (Siri searches that index to
find them), share as plain text, and the recipe screen tells Siri which recipe
"this recipe" means. The answers themselves live in
`Domain/KitchenAssistant.swift` and are unit tested.

`SousChefUITests` runs every intent out of process through Apple's App Intents
Testing framework (iOS 27 simulator), against a kitchen seeded by the
debug-only `ResetKitchenForTestsIntent`:

```sh
xcodebuild -scheme SousChef -destination 'platform=iOS Simulator,name=iPhone 18 Pro' -only-testing:SousChefUITests test
```

Spoken phrases still need checking by voice on a device with Siri, since
automated tests can't exercise speech recognition.

## Companion server sync

`Server/CompanionServer.swift` talks to an existing Sous Chef server through the
same `/api/auth` and `/api/kitchen` endpoints as the web app. No server changes
are required.

- The device store is the working copy, so the app works offline.
- Each sync pushes local changes (creates, updates and deletion tombstones), then
  mirrors the server's pantry, recipes and shopping list. Conflicts resolve as
  "latest pusher wins".
- On first connection, records that already exist on both sides (same name, and
  for pantry items the same location and unit) are paired instead of duplicated,
  and take the server's copy.
- Cooking while connected runs `cooking:cookRecipe` on the server, preserving
  its atomic inventory deduction. Offline, the same plan is applied locally.
- Recipe photos upload through `/api/files`, and server photos download.
- The session token is kept in the Keychain; switching kitchens replaces the
  device's server-linked data with the chosen kitchen.

With iCloud on and several devices connected to the same server, each device
syncs with both. Brief duplicates are possible if two devices create the same
item before either syncs.

## Community account

Browsing, saving and reporting community recipes need no account. Publishing
without a connected server uses a community account from Sign in with Apple
(`Server/CommunityAccount.swift`, `Features/Community/CommunityAccountViews.swift`).

- The community address defaults to `SousChefCommunityURL` in
  `SousChef-Info.plist`, the production community
  (`https://silent-gerbil-530.convex.site`). A custom address in Settings
  overrides it, and a connected server uses its own community connection.
- The system button asks only for the name scope, with a SHA-256 nonce the
  server checks. The server returns a 90-day publisher token, kept in the Keychain
  with the account's name and Apple user ID.
- The app checks the Apple ID credential state at launch and when it becomes
  active, and listens for credential revocation; a revoked or missing credential
  signs out locally.
- Settings → Community account shows the name, an optional display name editor,
  Sign out, and Delete community account, which removes the account and its
  recipes on the server and revokes the Apple sign-in.
- Unsigned simulator builds lack the entitlement: sign-in shows an error
  instead of crashing.

## App Review notes

- **AI:** only Apple's Foundation Models framework runs in the app. The optional
  server fallback uses the person's own server and their own provider key.
- **Companion server:** a client for self-hosted software the person runs, like
  Home Assistant or Jellyfin apps. The app is fully functional without one.
  Reviewers can use the web demo or a test server.
- **App Transport Security:** `NSAllowsArbitraryLoads` is set because home servers
  are often plain HTTP on LAN IPs, `.local` names or Tailscale addresses. The app
  warns before sending a password over HTTP to a public host.
- **User-generated content (1.2):** community recipes are hidden until the person
  agrees to the community guidelines (zero tolerance for objectionable content and
  abusive users; versioned, stored on the device). Every community recipe has
  **Report recipe** (reason plus optional note, emailed to community-souschef@georgevina.com
  through Mail, a `mailto:` link, or copyable text) and **Block <cook>** in its
  detail menu and long-press menu. Reported recipes and blocked cooks disappear
  at once and can be restored in Settings → Blocked cooks and hidden recipes. A
  built-in whole-word profanity and slur filter hides matching recipes. Publishing
  also requires accepting the guidelines. Reports are reviewed within 24 hours;
  Settings links the guidelines and the contact address. Code:
  `Domain/CommunityModeration.swift`, `Features/Community/CommunitySafety.swift`.
- **Sign in with Apple (4.8, 5.1.1(v)):** sign-in is only needed to publish
  recipes; browsing, saving and reporting work without an account. The app uses
  the system Sign in with Apple button, requests only the name, and never asks for
  a name or email afterwards (the name comes from Apple, or "Community cook"). A
  display name can optionally be changed in Settings. Settings → Community account
  → **Delete community account** deletes the account and everything it published
  on the server and revokes the Apple tokens through Apple's REST API.
- **Privacy:** barcode lookups send only the barcode to Open Food Facts. Kitchen
  data stays on the device, in the person's iCloud, or on their own server.
