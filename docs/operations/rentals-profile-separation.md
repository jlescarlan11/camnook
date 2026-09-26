# Rentals and Profile separation — implementation evidence

Date: 2026-09-26. Branch: `codex/rentals-profile`. Base: `ba1acab12a15e8dbcf15cd4881e50d5cd3ef1133`.

## Delivered behavior

- `/account` renders rentals at full width with no embedded profile/KYC form.
- `/account/profile` renders account email/status and one renter-details editor.
- Global navigation includes Profile; rentals and profile show their active destination.
- Rentals do not call the KYC RPC. Profile reads explicitly filter the authenticated user.
- Failed required profile reads cannot display a blank editor. An optional admin lookup failure cannot block the editor.
- Successful profile saves return to the profile section with feedback and invalidate all affected paths.
- Checkout return parameters and validation remain covered by the existing regression suites.
- Legacy form returns route to Profile. Old bookmarked account-section anchors provide a working Profile link.

## Validation

Node 24.19.0 and the pinned pnpm 10.33.1 were used for final checks.

- Baseline targeted suites: 26 tests passed before implementation.
- Loader/page regressions: 28 tests passed after observing the new behavior fail before implementation.
- Save, auth, request recovery, and checkout suites: 90 tests passed.
- Type checking passed after adding the page and loaders.
- Independent read-only review: no actionable findings in ownership, projection, redirects, revalidation, navigation, or error handling.
- The initial `pnpm verify:push` run passed lint/type checking, then reported 1,061 passing tests, 13 skipped, and two failures in existing return-recovery tests. Those two tests passed in isolation on both unchanged main and this branch.
- Full rerun with `pnpm test --maxWorkers=2`: **1,063 passed, 13 skipped** across 152 passing and three skipped test files. Reducing concurrency required no product or test changes.
- `pnpm build`: passed using the repository CI's placeholder environment values; the output includes the dynamic `/account/profile` route. This proves compilation, not hosted connectivity.

## Unverified environment-dependent checks

`pnpm dev:check` refused startup because the checkout has no Development environment files. No Development credentials were fabricated, and no hosted schema or customer data was changed. Actual Development permissions, signed-in save/reload, login return, map usability, and checkout continuation still need live verification.

A temporary synthetic layout harness was prepared, but both the in-app browser attachment and Chrome control timed out. Mobile/desktop visual and keyboard checks therefore remain unverified. The harness is not part of product code.

`pnpm launch:verify` validates the repository's existing launch-evidence document but reports its recorded `NO_GO` decision. This is not fresh live readiness evidence. No Production promotion was attempted.

## Release checklist

- Run the real Development flow with a synthetic renter: direct Profile login, initial setup, edit/save/reload, checkout continuation, and existing booking links.
- Inspect 375px and desktop layouts, long names/email, map controls, keyboard focus, and single header/main landmarks.
- Resolve the current release gates with fresh evidence; publish the exact integrated revision through `.github/workflows/release.yml`.
- Verify the promoted revision and both routes live. The change has no feature flag.
