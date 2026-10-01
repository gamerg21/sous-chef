# Sous Chef security audit — 2026-09-30

## Scope and release identity

Read-only application security review performed on macOS 27.0 (26A428), using
Node 24.21.0 and Corepack pnpm 10.30.3. Covers the native Designed for iPad Mac
app / iOS code, companion SQLite server, and optional community authentication.
This is not an audit of the Mac's firewall, FileVault, installed software, or
evidence of compromise.

- Current checkout: `62db373d3b2c56a27e90be44dce5a7db53f7036a`, iOS 1.1.0 (3).
- App Store Connect read-only API confirms **1.0.1 (6), READY_FOR_SALE**.
  Version 1.0.2 (8) is WAITING_FOR_REVIEW, not the public replacement yet.
- Release-source baseline: `2ad376ecbe9ebe99dd9f9ae4bc0734deeaf7326c`
  (the committed 1.0.1 (6) release bump). `ServerClient.swift` and
  `RecipeImporter.swift` are byte-identical between that baseline and HEAD.
- The installed `/Applications/SousChef.app` is older, 1.0 (5); it was not
  represented as a runtime test of 1.0.1. No matching 1.0.1 signed archive was
  found in the inspected archive locations. App Store metadata and the committed
  source are verified separately; binary-to-source provenance is not established.

No fixes, uploads, deployments, account changes, or production exploit attempts
were performed. Existing scheme changes and worktrees were preserved.

## Findings

### SC-01 — High: companion session cookie sent to external photo origins

- Class: credential disclosure / CWE-201.
- Confidence: **confirmed by local reproduction**.
- Identity: `ServerClient.download`, `CompanionServer` recipe sync.
- Locations: `ios/SousChef/Server/ServerClient.swift:154–161`,
  `ios/SousChef/Server/CompanionServer.swift:493–495`,
  `src/server/kitchen/recipes.ts:147–189`.
- A household member can create a recipe with an arbitrary external `photoUrl`.
  When another member syncs, the native client downloads that URL and explicitly
  attaches the viewer's `sous_chef_session` cookie, without checking origin.
  The recipient can replay the session with the victim's permissions; this can
  extend beyond the shared household if the victim has other access.
- Reproduction: an in-memory SQLite probe created an external-photo recipe as
  role `member`. Separately, the unmodified 1.0.1 `ServerClient.swift`, compiled
  on macOS, sent `sous_chef_session=AUDIT_DUMMY_TOKEN` to a loopback collector
  while its configured kitchen origin was `https://kitchen.example.invalid`.
  No real credentials were used. The collector observed the cookie.
- Affects 1.0.1 (6) and HEAD on iOS and Designed for iPad Mac; requires companion
  connection and a malicious photo URL, not standalone-only use.
- Fix: send credentials only to the exact kitchen scheme/host/effective port;
  use a separate unauthenticated session for external images. Enforce the same
  rule on redirects and reject HTTPS downgrades. Add cross-origin, port-change,
  protocol-relative URL, redirect, and same-origin regression tests.
- Relevant skill: `swiftui-pro` (focused native review).

### SC-02 — Medium: public IPv6 HTTP bypasses the credential warning

- Class: cleartext credential transmission / CWE-319.
- Confidence: **confirmed by local reproduction**.
- Identity: `ServerClient.isInsecureRemote`.
- Locations: `ios/SousChef/Server/ServerClient.swift:47–54`,
  `ios/SousChef/Features/Settings/SettingsView.swift:307`,
  `ios/SousChef-Info.plist:8–15`.
- The no-dot hostname shortcut treats IPv6 literals as local names.
  `http://[2606:4700:4700::1111]` returns `false`, while
  `http://example.com` returns `true`. The probe only classified these strings;
  it did not contact the public addresses. Global arbitrary-load permission
  allows HTTP, so the UI's intended warning is skipped for public IPv6 servers.
- Affects 1.0.1 (6) and HEAD. LAN HTTP is an intentional feature; the finding is
  the public-host classification bypass, not that feature itself.
- Fix: classify IPv4/IPv6 numerically before hostname handling, default unknown
  hosts to unsafe, and consider warning for all HTTP credentials. Enforce the
  policy in the connection layer as well as the UI.
- Relevant skill: `swiftui-pro`.

### SC-03 — Medium: import download limits apply after buffering

- Class: uncontrolled resource consumption / CWE-400.
- Confidence: **confirmed code defect**; device termination not induced.
- Identity: `RecipeImporter.importRecipe`, `RecipeImporter.downloadImage`.
- Locations: `ios/SousChef/Domain/RecipeImporter.swift:28–30,234–237`;
  `ServerClient.download:154–161` also has no response-size cap.
- `URLSession.data` buffers the response before the page is truncated to 4 MB
  or the image is checked against 8 MB. A malicious recipe site or image can
  force substantially larger allocations, causing memory pressure or app
  termination. The nominal limits do not bound transfer or peak memory.
- Affects 1.0.1 (6) and HEAD; requires fetching attacker-controlled content.
- Fix: stream responses with an enforced byte budget and immediate cancellation,
  including chunked/decoded bodies; check Content-Length only as an early
  rejection. Bound image dimensions before full decoding. Test oversized HTML,
  oversized images, and absent/misleading Content-Length.
- Relevant skill: `swiftui-pro`.

### SC-04 — High remediation priority: outdated web dependencies

- Class: known-vulnerable components / CWE-1395.
- Confidence: **confirmed affected package versions**; individual exploitability
  depends on deployed features/platform and was not reproduced.
- Identity/location: `package.json` and `pnpm-lock.yaml`; Next.js 16.1.6,
  sharp 0.34.5, @auth/core 0.37.4, and additional transitive dependencies.
- Live `pnpm audit --prod --json`: **48 advisories** (3 critical, 23 high,
  18 moderate, 4 low). Full dependency audit: **88** (4 critical, 47 high,
  33 moderate, 4 low). These are registry findings, not 48/88 demonstrated
  attacks, and production dependency graphs can include build-time utilities.
- Next.js upstream reports an AVIF image-optimization RCE in affected versions,
  patched in 16.3.3, and several Server Component denial-of-service advisories.
  This app uses App Router; the image optimizer's attacker-content reachability
  needs separate validation. No malicious AVIF payload was tested.
- The Windows-only Next.js RCE advisory does **not** establish RCE on this Mac.
  Auth.js email-normalization advisory applicability to the configured Convex
  Password/Email flow also remains unproven. Native Swift app binaries do not
  embed these npm dependencies; exposure is in the web/community stack.
- Fix: update Next.js and its matching tooling to a supported release covering
  all current advisories (16.3.3 is the cited AVIF fix floor, not a blanket
  version recommendation), refresh affected dependencies/overrides, and rerun
  audit, tests, type-check, lint, build, and browser acceptance.
- Primary sources:
  [Next.js AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4),
  [Next.js Server Components advisory](https://github.com/vercel/next.js/security/advisories/GHSA-q4gf-8mx6-v5v3).
- Relevant skill: general dependency review; Convex reviewer for community context.

### SC-05 — Medium: community password-reset links written to logs

- Class: sensitive information in logs / CWE-532.
- Confidence: **confirmed source behavior**; production configuration/log
  exposure was not inspected.
- Identity: `sendPasswordResetEmail`, `convex/auth.ts:106–110`.
- Without `RESEND_API_KEY`, the fallback logs the email and complete reset URL.
  A log reader can obtain a live recovery credential for a password-based
  community account. This does not affect native Apple sign-in or the separate
  SQLite reset implementation.
- Fix: log only delivery-unavailable status and fail closed or use an explicit
  operator recovery mechanism; never log reset credentials. If this path has
  run in production, review log access/retention and invalidate outstanding
  recovery credentials as appropriate.
- Relevant skill: `convex-reviewer`.

## Checks and limitations

- `pnpm test`: **22 files, 134 tests passed**, including SQLite security/auth
  and community Apple/hub/moderation tests.
- `pnpm type-check`: passed.
- Native release-source probe: cross-origin cookie disclosure and IPv6 warning
  bypass reproduced using macOS Foundation; SQLite member photo-path probe passed.
- Focused review included Keychain storage, Apple signature/issuer/audience/nonce
  checks, publisher ownership, request body limits, household/file permissions,
  share-inbox handling, transport configuration, and release debug-intent guards.
  Keychain uses device-only accessibility; local session tokens are hashed in
  SQLite, and public community writes derive user identity from bearer tokens.
- Lightweight tracked-file secret-pattern scan: 543 paths, one candidate
  (`convex/apple.test.ts`) confirmed to be dynamically generated test-key PEM
  formatting. This is not a full secret scan or Git-history scan.
- Full native UI/simulator tests, signed 1.0.1 entitlement inspection, full build
  and lint, CloudKit production permissions, live community deployment parity,
  and production penetration testing were not performed. Existing passing tests
  do not cover the reproduced native defects.
- Raw audit JSON, logs, and local probe scripts/results are under
  `/tmp/souschef-security-audit-20260930/` and may be removed by OS cleanup.

Prioritize SC-01 and web dependency remediation, then SC-02/03 and SC-05.
Apply native fixes to the public-release line as well as the 1.1.0 branch;
retest before preparing a separate release upload.
