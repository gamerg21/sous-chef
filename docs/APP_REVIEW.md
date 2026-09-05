# Sous Chef implementation and UX review

Reviewed September 5, 2026. Scope: home users, Convex-backed instances, desktop and mobile web. The checkout already contained substantial uncommitted development; this pass builds on those changes.

## Product direction

Keep Convex as the backend, with two clearly documented hosting paths: Convex Cloud plus a self-hosted web app, or a self-hosted Convex backend plus the same web app. Finish the everyday kitchen loop before expanding the extension catalog. Native companion clients and a managed paid backend remain future products.

The existing emerald/stone palette, consistent cards, pantry/fridge/freezer organization, and shared kitchen model are a useful foundation. The largest issues were functional dead ends and excessive mobile vertical space, rather than the visual identity.

## Implemented in this pass

| Finding | Impact | Change |
| --- | --- | --- |
| Docker startup URL could not configure a browser bundle built elsewhere | A home server could connect to the wrong backend or fail at startup | Public runtime config endpoint, setup fallback, health endpoint, and portable standalone image |
| Setup skipped Auth signing keys and units, mixed npm/pnpm, and configured backend secrets on the web container | A fresh checkout was not reliably usable | Backend setup command, doctor command, rewritten cloud/self-hosted/Docker guides |
| Password reset ignored Convex Auth's SITE_URL | Live recovery crashed before generating a link | SITE_URL fallback, regression coverage, corrected development origin; account owner successfully reset their password |
| No email provider still produced an email-success message | Users waited for mail that could never arrive | Public delivery capability and explicit operator-assisted recovery UI |
| Every dashboard route was mounted once for desktop and again for mobile | Duplicate hooks, effects, forms, subscriptions, and element IDs | A single responsive main region |
| Household switcher had no mutation callback | Choosing another household did not change the data | Persistent active household, authorization checks, membership-revocation fallback, and settings consistency |
| Bootstrap could expose an incomplete kitchen or silently sign users out on a transient failure | Confusing first-run and reconnect behavior | Await household creation and offer a retry without dropping the session |
| Inventory, recipe, and shopping summary cards consumed the mobile first screen | Primary content was pushed below the fold | Compact three-column phone summaries and clearer creation actions |
| Shared dialogs lacked focus containment and could exceed the viewport | Keyboard and small-screen forms were difficult to use | Native modal dialogs, scrollable bodies, visible Close, touch targets, nested-dialog Escape handling, and shared scroll locks |
| Shopping edit only changed name/category; save closed before the request succeeded | Users could not correct quantities/units and lost failed drafts | Shared complete add/edit form, validation, pending state, preserved drafts, and clearing optional values |
| Clearing checked items issued independent deletes | A failure could clear only part of the selection | Bounded atomic mutation; respects concurrent unchecks and safe retries |
| Repeated recipe ingredient rows reused the original stock amount | Cooking could double-count stock or attempt to delete a row twice | Track remaining stock across ingredient rows; regression test covers converted units and shortfalls |
| Repeated cooking clicks could submit multiple deductions | Accidental duplicate inventory deductions | In-flight guard and disabled confirmation while saving |
| Recipe editor still said it was preview-only and did not save | Working features appeared unfinished | Removed Design OS implementation copy and clarified real recipe behavior |
| Builds ignored TypeScript errors | Broken releases could pass a production build | Restored build-time type checking |

## Live UI checks

Used the actual signed-in app on port 3100. The user's kitchen was empty, so live visual checks covered first-run and form states without adding sample food to their kitchen.

- Phone viewports: 390×844 and 375×667. Desktop: 1280×800.
- Inventory: compact overview, empty-state guidance, add form, named fields, two-column form rows, scrolling, Close/Escape.
- Shopping: empty state, complete add form, unit dropdown, nested All units dialog. Escape closes only the top dialog and retains the underlying scroll lock.
- Recipes: library and editor, desktop sidebar, clearer primary action and removal of preview-only text.
- DOM checks: one main region and no horizontal overflow at the measured phone/desktop sizes.
- Password recovery: observed the original backend error, corrected deployment configuration, retrieved the operator-only link, and the user confirmed successful signin after changing their own password.

These are browser viewport checks, not physical iPhone/Android camera tests. Populated-list stress cases, uploads, real email delivery, and a clean machine Docker installation still need release acceptance.

## Validation

- 59 automated tests pass, including authorization, kitchen bootstrap/switching, shopping edits/atomic clearing, unit conversion/cooking, and public runtime config/auth URL regressions.
- Type check and production Next.js build pass with build-time type checking enabled.
- ESLint has no errors; the remaining warnings include existing generated-file, image, and React-hook warnings.
- Production standalone process served a different runtime backend URL than the build configuration, with `Cache-Control: no-store`.
- The same build with missing configuration returned `convexUrl: null` and `/api/health` returned 503. Health means web/config readiness, not backend health.
- Development backend changes were pushed to the configured dev deployment. No production deployment, image publication, or remote push was performed. Checkpoint commit: `137674f`.
- Docker is not installed on this machine. The container definition and standalone runtime were inspected/tested; an actual image build/Compose run is unverified.

## Remaining work, in order

1. **Completed: shared cooking plan.** Quantity-aware cards, shortages, unit conversion, oldest-expiry allocation, repeated ingredients, explicit manual checks, instructions, and actual deductions use the same calculation. Add-missing derives server-side shortages and avoids multiplying an unchanged request.
2. **Completed: purchases to inventory.** Reviewed quantities, units, storage, and expiry create separate batches atomically. Repeated requests cannot stock the same purchase twice; changed or foreign purchases are rejected.
3. **Completed: paste-to-draft capture.** Recipes with title/Ingredients/Instructions sections become editable drafts, preserving original text and attribution. Create/edit payloads now strip UI-only IDs, and editing can clear optional fields. Direct URL fetching remains unimplemented.
4. **Ship one optional AI workflow.** Existing provider configuration/testing and encrypted key storage are infrastructure. A constrained “ideas from my pantry” workflow with structured recipe drafts would be a useful first feature. It needs provider/model decisions, failure/timeout handling, and end-to-end testing with an operator-supplied key.
5. **Keep unavailable extensions out of the core journey.** Grocery/calendar integrations and a cross-instance community network remain scaffolding. Community sharing currently stays within a deployment. Avoid implying that enabling a listing installs a working integration.
6. **Finish home-server release acceptance.** Fresh Docker checkout, trusted HTTPS from a real phone, barcode camera permission/device selection, verified email delivery, household invitations, and data/storage restore drill. Document and test the self-hosted Convex backend path on real infrastructure before calling it one-click.
7. **Then offline and native clients.** Offline operation is not implemented. Decide what can be cached and which edits can safely queue before promising offline support. A future native client should connect to the same instance/backend rather than fork the domain rules.

## Suggested next acceptance scenario

On a fresh instance: create an account, add milk/eggs/rice, save a recipe, verify ingredient matching, cook once, check exact remaining quantities and shopping shortages, correct a shopping quantity, add a second household member, verify live updates and isolation, reset a password, then repeat on a phone. Automate this against a dedicated disposable test deployment so release tests never mutate a household's real food data.

## Continuation acceptance

- Live 390×844 purchase review stocked a temporary 2 l item in Fridge. A pasted recipe requiring 3 l correctly previewed 2 l deduction and 1 l shortage, then cooked successfully.
- This exercise exposed and fixed unit-selection focus reopening and recipe create/edit payload validation failures.
- New tests cover preview/mutation agreement, shortage deduplication, manual checks, purchase retry safety and household isolation, text capture, and actual recipe create/edit payloads.
