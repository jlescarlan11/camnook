# Issues

## ENV-001 — Intermittent external DNS failure
- Evidence: first catalog browser render showed a loading error; direct public RPC request failed with `ENOTFOUND`. Subsequent DNS lookup and same RPC returned HTTP 200, and browser reload displayed catalog.
- Impact: guest cannot begin booking while network is unavailable.
- Status: environment recovered; investigating retry journey before proposing application changes.
- Acceptance: recovery control performs a fresh request and restores catalog when service recovers.
- Evidence: ignored `.vercel/app-audit/2026-09-25/01-catalog-error.png`.
- Commit: none.

## ENV-002 — Baseline build cannot download Google Fonts
- Reproduction: `pnpm build` at starting revision.
- Evidence: `/tmp/camnook-audit-baseline-build.log`; Geist and Geist Mono network download errors. Development uses fallback fonts.
- Impact: production build verification blocked in this environment.
- Status: recovered with network; unmodified build retry passed. First fix's full build also passed.
- Acceptance: unmodified required build succeeds, or verified maintainable font-loading fix preserves typography.
- Commit: none.

## AUD-001 — CAPTCHA failure requires losing form state on refresh
- Severity: P2. Sign-in and resend share the affected challenge component.
- Reproduction: enter sign-in from selected rental dates; Cloudflare challenge fails; only recovery message instructs full-page refresh, discarding the email draft.
- Cause: widget errors clear the token but expose no existing-widget reset control.
- Acceptance: error/expiry offers an accessible retry; resetting preserves email and checkout destination; stale tokens stay cleared and submission stays disabled until a fresh token arrives. Script-load failure retains refresh guidance because no widget exists to reset.
- Fix: shared reset handler and retry button for rendered widget failures/expiry; expired feedback visible.
- Verification: two regression tests failed before fix and passed after. Full suite 959 passed / two skipped; lint, typecheck, build passed. Independent review found no actionable issues. Real Cloudflare failure/retry exercised: iframe restarted, email and checkout URL preserved, submission disabled. Provider continues rejecting this automated browser; successful provider challenge and OTP delivery are not claimed. Tests simulate fresh-token and expiry callbacks.
- Visuals: `03-signin-challenge-error.png`, `04-signin-retry-mobile.png` (actual 500 CSS px), `05-signin-retry-390.png` (390×844 mobile emulation) under ignored evidence directory. Desktop Lighthouse snapshot 30 passed / zero failed, accessibility 100; this is not a conformance audit.
- Status: verified scoped fix, committed.
- Commit: `6c6d221`.

## AUD-002 — Temporary authentication failure discards checkout draft
- Severity: P1; confirmed browser loss, provider classification reproduced by tests.
- Browser reproduction: synthetic renter selected meetup, entered purpose/city and reviewed a Sept 26–28 request. Submission redirected to login then back to empty checkout while session remained valid; Your rentals subsequently loaded without sign-in and no new booking appeared.
- Cause: `getAuthenticatedUser` returns null for all Supabase errors, including returned `AuthRetryableFetchError`. Request action catches thrown failures but redirects on null; proxy recognizes still-valid claims and redirects back. Draft is lost.
- Acceptance: temporary auth transport/429/5xx errors fail closed without treating the session as absent; request form preserves details and operation identity for retry; no privileged booking operation occurs until user verification succeeds; genuine missing/invalid sessions remain rejected. Page loads must expose an actionable retry rather than a sign-in redirect loop.
- Fix: retryable/429/5xx authentication errors throw a sanitized failure instead of returning an absent user. Existing checkout action catches it. A root page error boundary provides Next 16.3's documented `retry` action without exposing provider messages.
- Verification: one-time local Development HTTP 503 reproduced the pre-fix login round-trip/draft loss. Post-fix exact fault kept the route, purpose, city, place identity, and operation identity. After AUD-003 below, retry successfully created one synthetic Development booking; reload and page-error retry retained the persisted booking. Real account session used; outage itself is injected, not a real provider integration success claim.
- Evidence: `07-checkout-auth-recovered.png`, `08-page-retry-390.png`; desktop retry and 390×844 keyboard Tab/Enter retry exercised. No Production fault injection.
- Automated: four auth error tests failed before fix; seven helper tests and existing action tests passed after. Independent review: 25 focused tests passed, no actionable issues. Full serial suite: 967 passed, two skipped. Earlier concurrent runs hit unrelated 5-second test timeouts; assertions and timeouts were not weakened. Lint, typecheck, and build passed. Logs: `/tmp/camnook-audit-auth-serial-suite.log`, `/tmp/camnook-audit-auth-final-lint.log`, `/tmp/camnook-audit-auth-typecheck.log`, `/tmp/camnook-audit-auth-build.log`.
- Status: verified scoped fix; ready to commit.
- Commit: none.

## AUD-003 — Failed request resets hidden required meetup radio and blocks retry
- Severity: P1 for request recovery.
- Reproduction: submit from review, return a recoverable error, submit again. Browser reports `An invalid form control with name='meetupChoice' is not focusable.` Review still names the meetup while the hidden radio is unchecked.
- Cause: action completion performs a native form reset despite an application-level error result. The DOM radio resets to its initial unchecked state, diverging from controlled selection state.
- Fix: a native reset listener prevents reset while state owns the draft; listener removed on unmount. React `onReset` alone failed the regression and was replaced.
- Acceptance: selected meetup remains checked, native form validity holds, second submission reaches the action with the original operation/place identity. Stale meetup responses must still require a new explicit selection.
- Verification: new regression failed before fix and passes after; existing stale-place tests pass. Real browser injected auth failure then successful retry saved the synthetic booking. Reviewed together with AUD-002 because this defect blocked its end-to-end recovery.
- Status: verified scoped fix; ready to commit.
- Commit: none.
