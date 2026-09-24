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
- Status: verified scoped fix, committed.
- Commit: `6564117`.

## AUD-003 — Failed request resets hidden required meetup radio and blocks retry
- Severity: P1 for request recovery.
- Reproduction: submit from review, return a recoverable error, submit again. Browser reports `An invalid form control with name='meetupChoice' is not focusable.` Review still names the meetup while the hidden radio is unchecked.
- Cause: action completion performs a native form reset despite an application-level error result. The DOM radio resets to its initial unchecked state, diverging from controlled selection state.
- Fix: a native reset listener prevents reset while state owns the draft; listener removed on unmount. React `onReset` alone failed the regression and was replaced.
- Acceptance: selected meetup remains checked, native form validity holds, second submission reaches the action with the original operation/place identity. Stale meetup responses must still require a new explicit selection.
- Verification: new regression failed before fix and passes after; existing stale-place tests pass. Real browser injected auth failure then successful retry saved the synthetic booking. Reviewed together with AUD-002 because this defect blocked its end-to-end recovery.
- Status: verified scoped fix, committed.
- Commit: `6564117`.

## AUD-004 — Shared muted labels have insufficient contrast
- Severity: P2. Booking dates, status progress, review target, and meetup guidance are harder to read.
- Evidence: Lighthouse mobile snapshot of saved booking found 11 text contrast failures: #6f7d90 on white = 4.18:1, on #edf5ff = 3.81:1, below 4.5:1 for their 12–14px normal text.
- Cause: shared --color-stone-500 token. Source inspection shows text uses across renter and owner journeys, on light surfaces.
- Acceptance: affected normal text reaches at least 4.5:1 on actual surfaces; retain muted hierarchy and inspect booking, account, and profile at desktop/mobile.
- Fix: use existing --ink-muted (#58677d) for the shared stone-500 token. Contrast is 5.75:1 on white and 5.23:1 on booking blue.
- Verification: build passed; booking Lighthouse33 checks passed, zero failed on desktop/mobile; account desktop42 passed, mobile has a separate map-link styling finding but no text contrast failures. Privacy mobile27 passed. Screenshots09–12 inspected. No duplicate unit test for a CSS token.
- Status: scoped contrast fix verified; independent review found no actionable issues.
- Evidence: `/var/folders/mh/rxmkm5jd2s1d952s608rwwy40000gn/T/chrome-devtools-mcp-N5O1SQ/report.json`.
- Commit: `c90a9b7`.

## AUD-005 — Account content overflows mobile viewport
- Severity: P2. At 390px, booking text and Find a camera are clipped; account content reaches 417px.
- Evidence: screenshot12 and browser bounds: clientWidth390, scrollWidth417; primary grid children401px wide.
- Cause: implicit auto grid track retains the profile form minimum width and stretches the booking list. A browser-only minmax(0,1fr) experiment resolved overflow; explicit grid-cols-1 applies the same fix below the desktop breakpoint.
- Acceptance: profile and bookings fit 320/390px without clipping or horizontal scrolling; desktop layout preserved.
- Verification: actual changed page has clientWidth/scrollWidth320/320 and390/390; desktop1440 preserves821/411px tracks. Screenshots13–15 inspected; lint and build passed (`/tmp/camnook-audit-account-{lint,build}.log`).
- Status: verified; independent review found no actionable issues.
- Commit: `6867376`.

## AUD-006 — Map attribution link lacks a non-color distinction
- Severity: P2 accessibility. Account mobile Lighthouse reports Leaflet link blends into surrounding attribution text (2.55:1 color difference, no underline).
- Acceptance: attribution link remains readable and visibly distinguishable without color alone.
- Fix: scoped underline on attribution anchors within CamNook maps.
- Verification: loaded real map link computed underline; screenshot16 inspected; mobile Lighthouse42 passed, zero failed including link-in-text-block. Build passed (`/tmp/camnook-audit-map-link-build.log`); independent review found no actionable issues.
- Status: verified.
- Evidence: report `chrome-devtools-mcp-u3jeIj/report.json` and rendered map attribution.
- Commit: `32c4d7d`.

## AUD-007 — Checkout navigation erases rental plans
- Severity: P2. Enter purpose and shooting city, open Change dates, then Continue to checkout without changing dates: both fields are empty. Editing profile steps similarly unmounts the request form.
- Cause: request details and operation identity live only in component state, unlike existing KYC drafts.
- Acceptance: current-tab, account/camera-isolated drafts survive navigation/reload; same schedule retains retry identity, different schedules use distinct identities; restored meetup must match current version; changed saved profile supersedes stale defaults; review remains explicit; confirmed booking clears its draft.
- Design: reuse tab-storage expiry convention with validated records and separate schedule operation identities. Server returns its validated booking ID on success so client can clear storage and navigate with a visible success-link fallback. No backend booking rules changed.
- Verification: initial recovery tests failed before implementation. Review-driven tests caught exact-payload uncertainty, subsequent preflight failures, and partial storage writes;10 draft tests now pass. Final full serial suite977 passed, two skipped; lint and build passed (including type checking). Independent re-review found no remaining actionable issues. Earlier concurrent run hit resource-contention timeouts; checks were not weakened.
- Browser: purpose/city/meetup survive camera and profile navigation plus reload at390px. A real Development booking committed while an ignored local harness withheld its response. Changing to Sept29 and editing another draft, then returning to Sept28 restored the original operation and exact payload. Retry returned the original booking3f7bdcc3-357b-4b0b-a048-a194694411e2. Account count increased by exactly one (three total); completed main draft and operation cleared. Mobile checkout Lighthouse33 passed, zero failed. Screenshots18–19. Fault harness stopped afterward.
- Logs: `/tmp/camnook-audit-draft-final-{suite,lint}.log`, `/tmp/camnook-audit-draft-build.log`, `/tmp/camnook-audit-booking-fault-dev.log`.
- Status: verified scoped fix; ready to commit.
- Commit: none.

## ENV-003 — Development profile conflict responses time out
- Evidence: real two-tab stale-profile submissions returned generic retry after the app's30s deadline. Direct supported synthetic-auth probe read the current profile in667ms, but stale save timed out after45s. Current stored house remains Audit13, not the stale draft. Logs `/tmp/camnook-audit-profile-conflict{,-extended}.log`.
- Expected: SQL migration raises40001 for revision mismatch and pin reconfirmation; application then explains conflict. Cause not established: do not claim the intended conflict journey passed.
- Status: investigation pending Development database management access; no policy or schema bypass. Other reads and valid profile save passed.
- Commit: none.
