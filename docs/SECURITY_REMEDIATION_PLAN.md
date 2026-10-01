# Security remediation and release plan

Decision prepared 2026-09-30 from the
[security audit](SECURITY_AUDIT_2026-09-30.md).

## Recommendation

Ship a focused **1.0.3 security update**, and carry every native fix into 1.1.0.
Do not make remediation depend on completion of 1.1.0 features. The reproduced
session-cookie disclosure warrants a patch release even though it requires a
companion connection and an attacker-controlled recipe photo. Standalone users
are not exposed to that session theft, but malicious imports can affect them.

Live App Store Connect check: 1.0.1 (6) is public; 1.0.2 (8) remains waiting for
review. Current development is 1.1.0 (3). The two affected networking/import
files are identical between `release/1.0.2` and `macos-app`, reducing backport risk.

If replacing the pending 1.0.2 candidate would get the tested fixes to users
sooner, that is a reasonable alternative to the 1.0.3 number. Recheck release
state before submission; review timing is not predictable. This plan does not
withdraw, replace, or upload any release.

Only bundle exclusively into 1.1.0 if its full release candidate is already
ready, passes all security gates below, and can reach public users no later
than the patch. That readiness has not been established.

## Native patch scope and order

| Order | Finding | Change | Acceptance gate |
| --- | --- | --- | --- |
| 1 | SC-01: photo-cookie disclosure | Centralize exact origin comparison using scheme, normalized host and effective port. Attach kitchen credentials only to trusted kitchen requests. Fetch external photos without credentials or shared cookies. Reject cross-origin redirects for authenticated API requests and HTTPS downgrades; keep external-image redirects credential-free. | A collector sees no cookie or Authorization header on external absolute URLs, protocol-relative URLs, port changes, or redirects. Same-origin private photos and authenticated API calls still work. |
| 2 | SC-02: HTTP warning bypass | Parse numeric IPv4/IPv6 before hostname exceptions; require explicit acknowledgment for public/unknown HTTP destinations in the connection layer. Keep intentional LAN connectivity. | Public IPv4/IPv6 and ambiguous hosts require acknowledgment; HTTPS does not. Loopback/private IPv4, IPv6 loopback/link-local/unique-local, LAN names and supported tailnet names follow an explicit tested policy. Redirects cannot bypass it. |
| 3 | SC-03: unbounded downloads | Introduce a bounded streaming downloader shared by page, image and companion-photo downloads. Enforce existing page/image budgets while receiving decoded bytes, cancel immediately on overflow, and bound image dimensions before full decoding. | Oversized responses stop before buffering the entire body, including chunked, compressed and misleading-length responses. Ordinary imports, images and cancellation still work on iPhone and Mac. |

Keep unrelated feature work, persistence migrations and a broad networking
rewrite out of the patch. Include all three fixes if they clear the gates
together. If SC-03's image work materially delays the confirmed credential fix,
ship SC-01/02 first and schedule SC-03 as an immediate follow-up; do not quietly
defer it until the feature release.

## Implementation and verification sequence

1. Create an isolated patch branch/worktree from the reviewed `release/1.0.2`
   commit. Preserve existing worktrees and scheme edits. Keep each security fix
   and its regression tests in a focused commit.
2. Convert the audit probes into durable native regression tests. Establish
   failing tests first, then apply the fixes. Use dummy credentials and local
   servers only. Cover actual URLSession redirect behavior, not just a URL helper.
3. Run native unit tests and a Release build. Exercise companion login, sync,
   private/external photos, sign-out, web/share-sheet imports and oversized-input
   errors on iPhone and Designed for iPad Mac. Add an iPad smoke check. Confirm
   standalone/iCloud use and LAN servers remain functional.
4. Inspect the release archive: correct version/build, distribution entitlements,
   extension alignment, and absence of debug reset intents. Check that blocked
   image downloads do not repeatedly fail the entire kitchen sync.
5. Cherry-pick the security commits into the 1.1.0 branch and repeat native
   verification there, including widgets/meal-planning smoke checks. Keep version
   bump commits separate so the release lines retain their own numbering.
6. Prepare 1.0.3 (1), after verifying that version/build has not already been
   uploaded. Set app and every extension present on the branch consistently in
   `project.pbxproj`; keep automatic build-number management disabled. Add and
   commit the corresponding `ios/TESTFLIGHT.md` entry with the release changes.
   For a new 1.1.0 upload, increment from its freshly verified latest build.
   Resolve any unknown/rejected upload number with the maintainer, not by guessing.
7. Use `pnpm ios:testflight upload` when the tested release is ready for upload.
   Confirm processing and testing notes, complete beta acceptance, then submit
   the intended build for public release. Backend deployment, upload, review
   approval, and public availability are separate checkpoints.

Public release notes can describe protection for server connections and safer
recipe imports. Retain detailed regression evidence in the engineering report.

## Server work proceeds independently

- **SC-04:** Triage dependency advisories by production reachability and platform.
  Upgrade Next.js with matching tooling and affected transitive packages; handle
  Convex Auth compatibility separately. Run audit, tests, type-check, lint, build
  and browser acceptance. Record any remaining advisories with reachability and
  disposition. Publish the tested web/server update through its own release path;
  native App Store releases do not update self-hosted servers.
- **SC-05:** Remove reset URL/email logging and fail safely when community reset
  delivery is unavailable. Test configured and unconfigured delivery and assert
  that secrets never reach logs. Identify the community deployment before a
  separately authorized deployment. Do not deploy private SQLite changes to Convex.
- If evidence shows leaked real sessions or reset credentials, revoke the affected
  credentials and review relevant access logs. Updating the app alone does not
  revoke a session already stolen. No compromise was established by this audit.

## Release completion criteria

The original dummy-token attack fails on both release lines; legitimate kitchen
photos still work; HTTP warnings cannot be bypassed by public IPv6; download
limits are enforced during transfer; native acceptance and archive checks pass;
and the public build is verified available. Server fixes have their own deployed
verification and do not block the native security update.

## Status — 2026-10-01

Native fixes ship as **iOS 1.0.3 (1)** on `security/1.0.3`, branched from
`release/1.0.2` (`6e863ef`); the same fix commit is cherry-picked into the
1.1.0 line. App Store Connect showed no existing 1.0.3 build before the bump.

| Finding | State |
| --- | --- |
| SC-01 | Fixed. `BoundedFetch` compares scheme, host and effective port; only kitchen-origin photos get the session, other photos use a cookie-free session, authenticated requests refuse redirects off the kitchen, and external redirects strip credentials and refuse HTTPS→HTTP. |
| SC-02 | Fixed. IPv4/IPv6 are classified numerically before names; shorthand/numeric hosts and unknown names need confirmation. `ServerClient` refuses an unconfirmed public HTTP server before connecting; earlier confirmed hostname/IPv4 connections carry over, public IPv6 must reconnect. |
| SC-03 | Fixed. Pages (4 MB, truncated), recipe images (8 MB) and synced photos (10 MB) stream through a cancelling byte budget counted after decoding; images over 100 MP are refused from the header and are downsampled while decoding. |
| SC-04 | Open. Dependency upgrade follows its own web release path. |
| SC-05 | Fixed on the 1.1.0 line (`convex/auth.ts`); reset links are never logged and reset fails closed without email delivery. Not deployed. |

Verification: `ios/SousChefTests/SecurityTests.swift` (15 tests, real
URLSession traffic against loopback servers with dummy tokens) and the full
unit suite pass on both lines (iPhone 18 Pro simulator), and Release builds
succeed. Still to do before upload: device/Mac acceptance from step 3, archive
inspection from step 4, then `pnpm ios:testflight upload`. Nothing has been
uploaded, submitted or deployed.
