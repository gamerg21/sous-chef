# Sous Chef for iOS

A native SwiftUI port of Sous Chef for iPhone and iPad (iOS 26+). It works on
its own, syncs through the person's iCloud, and can optionally act as a
companion to a self-hosted Sous Chef server.

## What's in it

| Tab | Web equivalent | Notes |
| --- | --- | --- |
| Pantry | Inventory | Pantry, fridge and freezer with amounts, expiry and nutrition; VisionKit barcode scanning with Open Food Facts lookup. |
| Recipes | Recipes | Library, editor, import from a link (schema.org JSON-LD) or pasted text, pantry readiness, nutrition, sharing. |
| Cook | Cooking | Recipes ranked by what you have, cook mode with timers, and pantry deduction. |
| Shopping | Shopping list | Aisle grouping, AI aisle sorting, and putting purchases away into the pantry. |
| Community | Community | Browse, save and (with a server) publish community recipes. |

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

The target uses team `45SZPHTS5W` and bundle ID `io.souschef.app`. The first
signed device build registers these capabilities for the App ID:

- **iCloud (CloudKit)** with container `iCloud.io.souschef.app`, plus push
  notifications and the remote-notification background mode for CloudKit changes.
- **Private Cloud Compute** (`com.apple.developer.private-cloud-compute`) for
  Apple's larger Foundation Model.

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

It powers pantry recipe ideas (streamed with guided generation), reading recipes
from pasted text or pages without structured data, aisle sorting, and the
"Ask Sous Chef" chat in recipe and cook views. Ingredient amounts from pasted
text are parsed deterministically, so the model can't invent them.

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

## App Review notes

- **AI:** only Apple's Foundation Models framework runs in the app. The optional
  server fallback uses the person's own server and their own provider key.
- **Companion server:** a client for self-hosted software the person runs, like
  Home Assistant or Jellyfin apps. The app is fully functional without one.
  Reviewers can use the web demo or a test server.
- **App Transport Security:** `NSAllowsArbitraryLoads` is set because home servers
  are often plain HTTP on LAN IPs, `.local` names or Tailscale addresses. The app
  warns before sending a password over HTTP to a public host.
- **Privacy:** barcode lookups send only the barcode to Open Food Facts. Kitchen
  data stays on the device, in the person's iCloud, or on their own server.
