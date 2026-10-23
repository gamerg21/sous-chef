# iOS release branches

Each iOS marketing version gets one pair of branches. The web app keeps its own
flow: topic branches merge into `main`, and `vX.Y.Z` tags are the stable web
releases.

## Branches

| Branch | Cut from | What goes in | Builds |
| --- | --- | --- | --- |
| `feat/*`, `fix/*` | `beta/ios-X.Y.Z` (or `main`) | one feature or fix | development only |
| `beta/ios-X.Y.Z` | `main` | that version's features, merged by PR | every TestFlight build for X.Y.Z |
| `release/ios-X.Y.Z` | `beta/ios-X.Y.Z` when testing ends | fixes only | the release candidate and the App Review submission |

1. Cut `beta/ios-X.Y.Z` from `main` when work on the version starts. Open each
   feature or fix as a PR into it. Merge `main` into it to pick up shared code.
2. When TestFlight testing ends, cut `release/ios-X.Y.Z` from it. Only fixes go
   in from then on; they also merge back into `beta/ios-X.Y.Z` if it's still open.
3. After App Review approves the version, open a PR from `release/ios-X.Y.Z`
   into `main`, tag the merge `ios-vX.Y.Z`, then delete both branches.

## Hotfixes

Cut `release/ios-X.Y.(Z+1)` from the `ios-vX.Y.Z` tag. Merge the fix into any
open `beta/ios-*` branch too, so the next version doesn't lose it.

## Rules

- Web and server code (everything outside `ios/`) doesn't start on an iOS
  branch. Open it as its own PR into `main`, then merge `main` into the iOS
  branch.
- Build numbers keep counting up across versions and never reset: 1.1.2 was
  build 25 and 1.2.0 continued at 26. Branches for different versions can be
  open at once, and one sequence keeps every upload unique.
- Upload TestFlight builds from the version's `beta/ios-*` or `release/ios-*`
  branch.
